pub fn build_download_authorize_url(
    book_id: &str,
    vol_id: &str,
    mobi_type: u8,
    line: u8,
) -> Result<String, String> {
    if !book_id.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Err("invalid book id".to_string());
    }
    if !vol_id.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return Err("invalid vol id".to_string());
    }
    if line == 9 {
        return Err("package download is forbidden".to_string());
    }
    if line > 1 {
        return Err("only single-item line 0 or 1 is allowed".to_string());
    }
    if mobi_type > 2 {
        return Err("invalid format type".to_string());
    }
    Ok(format!(
        "/getdownurl.php?b={book_id}&v={vol_id}&mobi={mobi_type}&vip={line}&json=1"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_single_item_authorization_paths() {
        assert_eq!(
            build_download_authorize_url("53339", "3089", 1, 0).unwrap(),
            "/getdownurl.php?b=53339&v=3089&mobi=1&vip=0&json=1"
        );
        assert_eq!(
            build_download_authorize_url("53339", "3089", 2, 1).unwrap(),
            "/getdownurl.php?b=53339&v=3089&mobi=2&vip=1&json=1"
        );
    }

    #[test]
    fn rejects_package_batch_like_inputs() {
        assert!(build_download_authorize_url("53339", "3089", 1, 9).is_err());
        assert!(build_download_authorize_url("53339", "3089,3090", 1, 0).is_err());
        assert!(build_download_authorize_url("53339", "3089", 3, 0).is_err());
        assert!(build_download_authorize_url("../53339", "3089", 1, 0).is_err());
    }
}
