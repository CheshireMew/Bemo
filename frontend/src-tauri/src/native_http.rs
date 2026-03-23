use std::collections::HashMap;

use base64::Engine;
use reqwest::{
  header::{HeaderMap, HeaderName, HeaderValue},
  redirect::Policy,
  Client, Method,
};
use serde::{Deserialize, Serialize};

const BODY_ENCODING_TEXT: &str = "text";
const BODY_ENCODING_BASE64: &str = "base64";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpRequestPayload {
  pub url: String,
  pub method: String,
  #[serde(default)]
  pub headers: HashMap<String, String>,
  pub body: Option<String>,
  pub body_encoding: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeHttpResponsePayload {
  pub status: u16,
  pub url: String,
  pub headers: HashMap<String, String>,
  pub body: String,
  pub body_encoding: String,
}

fn build_headers(input: HashMap<String, String>) -> Result<HeaderMap, String> {
  let mut headers = HeaderMap::new();
  for (key, value) in input {
    let name = HeaderName::from_bytes(key.as_bytes()).map_err(|error| error.to_string())?;
    let header_value = HeaderValue::from_str(&value).map_err(|error| error.to_string())?;
    headers.insert(name, header_value);
  }
  Ok(headers)
}

fn get_client() -> Result<Client, String> {
  Client::builder()
    .redirect(Policy::limited(10))
    .build()
    .map_err(|error| error.to_string())
}

fn decode_body(payload: &NativeHttpRequestPayload) -> Result<Option<Vec<u8>>, String> {
  let Some(body) = payload.body.as_ref() else {
    return Ok(None);
  };

  match payload.body_encoding.as_deref().unwrap_or(BODY_ENCODING_TEXT) {
    BODY_ENCODING_BASE64 => base64::engine::general_purpose::STANDARD
      .decode(body)
      .map(Some)
      .map_err(|error| error.to_string()),
    BODY_ENCODING_TEXT => Ok(Some(body.as_bytes().to_vec())),
    other => Err(format!("Unsupported body encoding: {other}")),
  }
}

fn collect_headers(headers: &HeaderMap) -> HashMap<String, String> {
  headers
    .iter()
    .filter_map(|(key, value)| value.to_str().ok().map(|text| (key.to_string(), text.to_string())))
    .collect()
}

#[tauri::command]
pub async fn native_http_request(payload: NativeHttpRequestPayload) -> Result<NativeHttpResponsePayload, String> {
  let client = get_client()?;
  let body = decode_body(&payload)?;
  let method = Method::from_bytes(payload.method.as_bytes()).map_err(|error| error.to_string())?;
  let headers = build_headers(payload.headers)?;

  let mut request = client.request(method, &payload.url).headers(headers);
  if let Some(body_bytes) = body {
    request = request.body(body_bytes);
  }

  let response = request.send().await.map_err(|error| error.to_string())?;
  let status = response.status().as_u16();
  let url = response.url().to_string();
  let headers = collect_headers(response.headers());
  let bytes = response.bytes().await.map_err(|error| error.to_string())?;

  Ok(NativeHttpResponsePayload {
    status,
    url,
    headers,
    body: base64::engine::general_purpose::STANDARD.encode(bytes),
    body_encoding: BODY_ENCODING_BASE64.to_string(),
  })
}
