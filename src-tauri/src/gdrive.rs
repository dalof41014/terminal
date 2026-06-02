//! Google Drive sync. The encrypted vault is stored in Drive's hidden
//! `appDataFolder` (scope `drive.appdata`), so it never appears in the user's
//! normal Drive and the app can only touch its own files.
//!
//! Auth uses the OAuth 2.0 "installed app" flow with PKCE and a loopback
//! redirect — no client secret needs to stay confidential.

use anyhow::anyhow;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const SCOPE: &str =
    "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";

#[derive(Deserialize)]
struct TokenResp {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub id: String,
    #[serde(default)]
    pub modified_time: Option<String>,
}

#[derive(Deserialize)]
struct FilesList {
    #[serde(default)]
    files: Vec<RemoteFile>,
}

#[derive(Deserialize)]
struct FileId {
    id: String,
}

fn gen_verifier() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    B64URL.encode(b)
}

fn challenge_of(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    B64URL.encode(digest)
}

/// Run the interactive OAuth flow. Returns (refresh_token, email).
pub async fn run_oauth(client_id: &str, client_secret: &str) -> anyhow::Result<(String, Option<String>)> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let redirect = format!("http://127.0.0.1:{port}");

    let verifier = gen_verifier();
    let challenge = challenge_of(&verifier);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect),
        urlencoding::encode(SCOPE),
        challenge,
    );

    let _ = open::that(&auth_url);

    let code = accept_code(&listener).await?;

    let client = reqwest::Client::new();
    let params = [
        ("code", code.as_str()),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", redirect.as_str()),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier.as_str()),
    ];
    let resp: TokenResp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let refresh = resp
        .refresh_token
        .ok_or_else(|| anyhow!("Google did not return a refresh token; revoke access and retry"))?;
    let email = fetch_email(&client, &resp.access_token).await.ok();
    Ok((refresh, email))
}

async fn accept_code(listener: &TcpListener) -> anyhow::Result<String> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(180);
    loop {
        let (mut stream, _) = tokio::time::timeout_at(deadline, listener.accept())
            .await
            .map_err(|_| anyhow!("authorization timed out"))??;

        let mut buf = vec![0u8; 4096];
        let n = stream.read(&mut buf).await.unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]);
        let target = req
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .unwrap_or("");

        if let Some(idx) = target.find('?') {
            let mut code = None;
            let mut err = None;
            for pair in target[idx + 1..].split('&') {
                let mut it = pair.splitn(2, '=');
                let k = it.next().unwrap_or("");
                let v = it.next().unwrap_or("");
                let v = urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_default();
                match k {
                    "code" => code = Some(v),
                    "error" => err = Some(v),
                    _ => {}
                }
            }

            let body = "<!doctype html><html><body style=\"font-family:system-ui;background:#0F172A;color:#F8FAFC;text-align:center;padding-top:90px\"><h2 style=\"color:#22C55E\">Tapterm — Google Drive connected</h2><p>You can close this tab and return to the app.</p></body></html>";
            let http = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(http.as_bytes()).await;
            let _ = stream.flush().await;

            if let Some(e) = err {
                anyhow::bail!("authorization denied: {e}");
            }
            if let Some(c) = code {
                return Ok(c);
            }
        }
        // ignore unrelated requests (favicon, etc.) and keep waiting
    }
}

async fn fetch_email(client: &reqwest::Client, token: &str) -> anyhow::Result<String> {
    let v: serde_json::Value = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(v.get("email").and_then(|e| e.as_str()).unwrap_or("").to_string())
}

/// Exchange a refresh token for a fresh access token.
pub async fn access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let resp: TokenResp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(resp.access_token)
}

pub async fn find_vault_file(token: &str) -> anyhow::Result<Option<RemoteFile>> {
    let client = reqwest::Client::new();
    let resp: FilesList = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(token)
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", "name = 'vault.json'"),
            ("fields", "files(id,modifiedTime)"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(resp.files.into_iter().next())
}

pub async fn download(token: &str, id: &str) -> anyhow::Result<Vec<u8>> {
    let client = reqwest::Client::new();
    let bytes = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{id}"))
        .bearer_auth(token)
        .query(&[("alt", "media")])
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    Ok(bytes.to_vec())
}

pub async fn upload_create(token: &str, bytes: &[u8]) -> anyhow::Result<String> {
    let client = reqwest::Client::new();
    let metadata = serde_json::json!({ "name": "vault.json", "parents": ["appDataFolder"] });
    let boundary = "terminalAppBoundary8f2c4d";
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(&serde_json::to_vec(&metadata)?);
    body.extend_from_slice(
        format!("\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let resp: FileId = client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .bearer_auth(token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={boundary}"),
        )
        .body(body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(resp.id)
}

pub async fn upload_update(token: &str, id: &str, bytes: &[u8]) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    client
        .patch(format!(
            "https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media"
        ))
        .bearer_auth(token)
        .header("Content-Type", "application/octet-stream")
        .body(bytes.to_vec())
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
