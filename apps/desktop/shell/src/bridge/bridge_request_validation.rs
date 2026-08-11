// SPDX-License-Identifier: GPL-3.0-only

fn has_http_control_chars(value: &str) -> bool {
    value.contains('\r') || value.contains('\n') || value.contains('\0')
}

fn is_allowed_backend_api_path(path: &str) -> bool {
    path == "/api/v1" || path.starts_with("/api/v1/")
}

fn sanitize_bridge_request_headers(
    headers: Option<&HashMap<String, String>>,
) -> Result<HashMap<String, String>, BridgeCommandError> {
    let mut sanitized = HashMap::<String, String>::new();
    if let Some(headers_map) = headers {
        if headers_map.len() > BACKEND_HTTP_REQUEST_HEADER_MAX_COUNT {
            return Err(bridge_command_error("INVALID_PARAMS"));
        }
        for (name, value) in headers_map {
            let trimmed_name = name.trim();
            let trimmed_value = value.trim();
            if trimmed_name.is_empty() {
                continue;
            }
            if has_http_control_chars(trimmed_name)
                || has_http_control_chars(trimmed_value)
                || trimmed_name.contains(':')
                || trimmed_name.chars().count() > BACKEND_HTTP_REQUEST_HEADER_NAME_MAX_CHARS
                || trimmed_value.chars().count() > BACKEND_HTTP_REQUEST_HEADER_VALUE_MAX_CHARS
            {
                return Err(bridge_command_error("INVALID_PARAMS"));
            }
            sanitized.insert(trimmed_name.to_string(), trimmed_value.to_string());
        }
    }
    Ok(sanitized)
}

pub(crate) fn validate_backend_bridge_request(
    method: &str,
    path: &str,
    headers: Option<&HashMap<String, String>>,
) -> Result<(String, String, HashMap<String, String>), BridgeCommandError> {
    let normalized_method = normalize_http_method(method);
    if !matches!(
        normalized_method.as_str(),
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    ) {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    let normalized_path = normalize_http_path(path);
    let (normalized_pathname, query) = normalized_path
        .split_once('?')
        .map_or((normalized_path.as_str(), None), |(pathname, query)| {
            (pathname, Some(query))
        });
    if has_http_control_chars(&normalized_path)
        || normalized_path.contains(' ')
        || normalized_path.contains('#')
        || normalized_path.chars().count() > BACKEND_HTTP_REQUEST_PATH_MAX_CHARS
        || !is_allowed_backend_api_path(normalized_pathname)
        || normalized_pathname.split('/').any(|segment| segment == "..")
        || normalized_pathname.contains("//")
        || query.is_some_and(|value| value.contains('?') || value.contains('#'))
    {
        return Err(bridge_command_error("INVALID_PARAMS"));
    }
    let sanitized_headers = sanitize_bridge_request_headers(headers)?;
    Ok((normalized_method, normalized_path, sanitized_headers))
}
