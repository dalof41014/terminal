//! Minimal Telnet client. Opens a raw TCP connection, performs basic IAC
//! option negotiation (NAWS, terminal-type, ECHO, SGA) and streams data to the
//! frontend using the same `ssh://data/<id>` events as SSH/local sessions.

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex};

const IAC: u8 = 255;
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250;
const SE: u8 = 240;
const OPT_ECHO: u8 = 1;
const OPT_SGA: u8 = 3;
const OPT_TTYPE: u8 = 24;
const OPT_NAWS: u8 = 31;

pub enum TelnetCmd {
    Data(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Close,
}

#[derive(Clone)]
pub struct TelnetManager {
    sessions: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<TelnetCmd>>>>,
}

enum St {
    Data,
    Iac,
    Verb(u8),
    Sb,
    SbIac,
}

fn naws(cols: u16, rows: u16) -> Vec<u8> {
    let mut v = vec![IAC, SB, OPT_NAWS];
    for b in [(cols >> 8) as u8, cols as u8, (rows >> 8) as u8, rows as u8] {
        if b == IAC {
            v.push(IAC);
        }
        v.push(b);
    }
    v.push(IAC);
    v.push(SE);
    v
}

fn escape_iac(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    for &b in data {
        out.push(b);
        if b == IAC {
            out.push(IAC);
        }
    }
    out
}

impl TelnetManager {
    pub fn new() -> Self {
        TelnetManager {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn open(
        &self,
        app: AppHandle,
        id: String,
        host: String,
        port: u16,
        cols: u16,
        rows: u16,
    ) -> anyhow::Result<()> {
        let stream = tokio::net::TcpStream::connect((host.as_str(), port)).await?;
        let (tx, mut rx) = mpsc::unbounded_channel::<TelnetCmd>();
        self.sessions.lock().await.insert(id.clone(), tx);
        let sessions = self.sessions.clone();

        tokio::spawn(async move {
            let mut stream = stream;
            let (mut rd, mut wr) = stream.split();
            let mut buf = [0u8; 4096];
            let mut st = St::Data;
            let mut sb: Vec<u8> = Vec::new();
            let mut cur_cols = cols;
            let mut cur_rows = rows;

            loop {
                tokio::select! {
                    r = rd.read(&mut buf) => {
                        let n = match r { Ok(0) | Err(_) => break, Ok(n) => n };
                        let mut out: Vec<u8> = Vec::new();
                        let mut resp: Vec<u8> = Vec::new();
                        for &b in &buf[..n] {
                            match st {
                                St::Data => {
                                    if b == IAC { st = St::Iac } else { out.push(b) }
                                }
                                St::Iac => match b {
                                    IAC => { out.push(IAC); st = St::Data }
                                    WILL | WONT | DO | DONT => st = St::Verb(b),
                                    SB => { sb.clear(); st = St::Sb }
                                    _ => st = St::Data,
                                },
                                St::Verb(verb) => {
                                    negotiate(verb, b, &mut resp, cur_cols, cur_rows);
                                    st = St::Data;
                                }
                                St::Sb => {
                                    if b == IAC { st = St::SbIac } else { sb.push(b) }
                                }
                                St::SbIac => match b {
                                    SE => { handle_subneg(&sb, &mut resp); st = St::Data }
                                    IAC => { sb.push(IAC); st = St::Sb }
                                    _ => st = St::Sb,
                                },
                            }
                        }
                        if !out.is_empty() {
                            let _ = app.emit(
                                &format!("ssh://data/{id}"),
                                String::from_utf8_lossy(&out).to_string(),
                            );
                        }
                        if !resp.is_empty() {
                            let _ = wr.write_all(&resp).await;
                            let _ = wr.flush().await;
                        }
                    }
                    cmd = rx.recv() => {
                        match cmd {
                            Some(TelnetCmd::Data(d)) => {
                                let _ = wr.write_all(&escape_iac(&d)).await;
                                let _ = wr.flush().await;
                            }
                            Some(TelnetCmd::Resize { cols, rows }) => {
                                cur_cols = cols;
                                cur_rows = rows;
                                let _ = wr.write_all(&naws(cols, rows)).await;
                                let _ = wr.flush().await;
                            }
                            Some(TelnetCmd::Close) | None => break,
                        }
                    }
                }
            }
            sessions.lock().await.remove(&id);
            let _ = app.emit(&format!("ssh://closed/{id}"), ());
        });

        Ok(())
    }

    pub async fn send(&self, id: &str, data: Vec<u8>) {
        if let Some(tx) = self.sessions.lock().await.get(id) {
            let _ = tx.send(TelnetCmd::Data(data));
        }
    }

    pub async fn resize(&self, id: &str, cols: u16, rows: u16) {
        if let Some(tx) = self.sessions.lock().await.get(id) {
            let _ = tx.send(TelnetCmd::Resize { cols, rows });
        }
    }

    pub async fn close(&self, id: &str) {
        if let Some(tx) = self.sessions.lock().await.get(id) {
            let _ = tx.send(TelnetCmd::Close);
        }
    }
}

fn negotiate(verb: u8, opt: u8, resp: &mut Vec<u8>, cols: u16, rows: u16) {
    match verb {
        DO => match opt {
            OPT_NAWS => {
                resp.extend_from_slice(&[IAC, WILL, OPT_NAWS]);
                resp.extend_from_slice(&naws(cols, rows));
            }
            OPT_TTYPE => resp.extend_from_slice(&[IAC, WILL, OPT_TTYPE]),
            OPT_SGA => resp.extend_from_slice(&[IAC, WILL, OPT_SGA]),
            _ => resp.extend_from_slice(&[IAC, WONT, opt]),
        },
        WILL => match opt {
            OPT_ECHO => resp.extend_from_slice(&[IAC, DO, OPT_ECHO]),
            OPT_SGA => resp.extend_from_slice(&[IAC, DO, OPT_SGA]),
            _ => resp.extend_from_slice(&[IAC, DONT, opt]),
        },
        // ignore WONT/DONT to avoid negotiation loops
        _ => {}
    }
}

fn handle_subneg(sb: &[u8], resp: &mut Vec<u8>) {
    // terminal-type SEND -> reply IS "xterm-256color"
    if sb.len() >= 2 && sb[0] == OPT_TTYPE && sb[1] == 1 {
        resp.extend_from_slice(&[IAC, SB, OPT_TTYPE, 0]);
        resp.extend_from_slice(b"xterm-256color");
        resp.extend_from_slice(&[IAC, SE]);
    }
}
