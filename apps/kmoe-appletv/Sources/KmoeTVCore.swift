import Foundation
import SQLite3

struct TVCatalogItem: Identifiable, Equatable {
    let id: String
    let title: String
    let author: String?
    let coverURL: URL?
    let latestVolume: String?
}

struct TVChapter: Identifiable, Equatable {
    let id: String
    let title: String
    let epubSizeMB: Double

    var sizeLabel: String {
        epubSizeMB > 0 ? String(format: "%.1f MB", epubSizeMB) : "EPUB"
    }
}

struct TVComicDetail: Equatable {
    let id: String
    let title: String
    let description: String
    let chapters: [TVChapter]
}

enum TVKmoeError: LocalizedError {
    case badResponse
    case notAuthenticated
    case parseFailed
    case unsafePath
    case database(String)

    var errorDescription: String? {
        switch self {
        case .badResponse: "站点响应不可用。"
        case .notAuthenticated: "登录未建立有效会话。"
        case .parseFailed: "站点内容解析失败。"
        case .unsafePath: "路径未通过安全检查。"
        case .database(let message): "数据库错误：\(message)"
        }
    }
}

@MainActor
final class TVKmoeClient {
    private let baseURL = URL(string: "https://kxo.moe")!
    private let session: URLSession
    private let cookieStorage: HTTPCookieStorage
    private let cookieStoreKey = "kmoelite.tv.session.cookies"

    init() {
        cookieStorage = HTTPCookieStorage()
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = cookieStorage
        configuration.httpShouldSetCookies = true
        configuration.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 (AppleTV; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 KmoeliteTV/0.1",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        ]
        session = URLSession(configuration: configuration)
        restoreCookies()
    }

    func login(email: String, password: String) async throws {
        _ = try await text(path: "/login.php")
        var request = URLRequest(url: baseURL.appending(path: "/login_do.php"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL.appending(path: "/login.php").absoluteString, forHTTPHeaderField: "Referer")
        let body = "email=\(Self.form(email))&passwd=\(Self.form(password))&keepalive=on"
        request.httpBody = body.data(using: .utf8)
        let response = try await text(request: request)
        guard Self.loginSucceeded(response) else { throw TVKmoeError.notAuthenticated }
        let profile = try await text(path: "/my.php")
        guard Self.profileAuthenticated(profile) else { throw TVKmoeError.notAuthenticated }
        persistCookies()
    }

    func fetchCatalog(page: Int = 1) async throws -> [TVCatalogItem] {
        let raw = try await data(path: "/data_list.php?p=\(max(1, page))")
        return try TVKmoeParser.parseCatalog(raw, baseURL: baseURL)
    }

    func fetchDetail(comicID: String) async throws -> TVComicDetail {
        guard Self.isSafeID(comicID) else { throw TVKmoeError.unsafePath }
        let html = try await text(path: "/c/\(comicID).htm")
        guard let bookDataPath = TVKmoeParser.bookDataPath(in: html) else { throw TVKmoeError.parseFailed }
        let bookData = try await text(path: bookDataPath)
        return TVComicDetail(
            id: comicID,
            title: TVKmoeParser.detailTitle(in: html) ?? "KMOE \(comicID)",
            description: TVKmoeParser.detailDescription(in: html) ?? "暂无简介。",
            chapters: TVKmoeParser.parseEpubChapters(bookData)
        )
    }

    private func data(path: String) async throws -> Data {
        try await data(request: URLRequest(url: safeURL(path: path)))
    }

    private func text(path: String) async throws -> String {
        try await text(request: URLRequest(url: safeURL(path: path)))
    }

    private func text(request: URLRequest) async throws -> String {
        let data = try await data(request: request)
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func data(request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TVKmoeError.badResponse
        }
        return data
    }

    private func safeURL(path: String) -> URL {
        let url = URL(string: path, relativeTo: baseURL)!.absoluteURL
        precondition(url.scheme == "https" && url.host == baseURL.host)
        return url
    }

    private func persistCookies() {
        let values = cookieStorage.cookies?.map { "\($0.name)=\($0.value)" } ?? []
        UserDefaults.standard.set(values, forKey: cookieStoreKey)
    }

    private func restoreCookies() {
        guard let values = UserDefaults.standard.stringArray(forKey: cookieStoreKey) else { return }
        for value in values {
            let parts = value.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            var properties: [HTTPCookiePropertyKey: Any] = [
                .domain: "kxo.moe",
                .path: "/",
                .name: parts[0],
                .value: parts[1],
                .secure: "TRUE"
            ]
            properties[.expires] = Date(timeIntervalSinceNow: 60 * 60 * 24 * 30)
            if let cookie = HTTPCookie(properties: properties) {
                cookieStorage.setCookie(cookie)
            }
        }
    }

    nonisolated static func loginSucceeded(_ body: String) -> Bool {
        let compact = body.filter { !$0.isWhitespace }
        return (compact.contains("do_call_action") || compact.contains("location.href") || compact.contains("display_codeinfo(\"m100\"") || compact.contains("display_codeinfo('m100'"))
            && !body.contains("e400")
            && !body.contains("e401")
            && !body.lowercased().contains("forbidden")
    }

    nonisolated static func profileAuthenticated(_ body: String) -> Bool {
        body.contains("KMOE ID") || body.contains("登錄郵箱") || body.contains("登录邮箱") || body.lowercased().contains("logout")
    }

    nonisolated static func form(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }

    nonisolated static func isSafeID(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 80 && value.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
    }
}

enum TVKmoeParser {
    static func parseCatalog(_ data: Data, baseURL: URL) throws -> [TVCatalogItem] {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let root = object as? [String: Any], let rows = root["data"] as? [[String: Any]] else {
            throw TVKmoeError.parseFailed
        }
        return rows.compactMap { row in
            let url = string(row["url_book"])
            let id = comicID(from: url) ?? string(row["id"])
            guard !id.isEmpty else { return nil }
            return TVCatalogItem(
                id: id,
                title: stripHTML(string(row["name"])).ifEmpty("KMOE \(id)"),
                author: stripHTML(string(row["author"])).nilIfEmpty,
                coverURL: absoluteURL(string(row["url_cover"]), baseURL: baseURL),
                latestVolume: stripHTML(string(row["newvol"])).nilIfEmpty
            )
        }
    }

    static func detailTitle(in html: String) -> String? {
        firstMatch(#"text_bglight_big[^>]*>([^<]+)"#, in: html).map(stripHTML)
    }

    static func detailDescription(in html: String) -> String? {
        firstMatch(#"id=["']div_desc_content["'][^>]*>([\s\S]*?)</div>"#, in: html).map(stripHTML)?.nilIfEmpty
    }

    static func bookDataPath(in html: String) -> String? {
        firstMatch(#"(/book_data\.php\?h=[A-Za-z0-9_\-]+(?:&amp;[A-Za-z0-9_.\-]+=[A-Za-z0-9_.\-]+)*)"#, in: html)?
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    static func parseEpubChapters(_ bookData: String) -> [TVChapter] {
        var chapters: [TVChapter] = []
        for payload in volinfoPayloads(bookData) {
            let fields = payload.split(separator: ",", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            guard fields.count > 11, !fields[0].isEmpty, let size = Double(fields[11]), size > 0 else { continue }
            let title = fields.count > 5 && !fields[5].isEmpty ? fields[5] : "卷 \(fields[0])"
            chapters.append(TVChapter(id: fields[0], title: title, epubSizeMB: size))
        }
        return chapters
    }

    private static func volinfoPayloads(_ input: String) -> [String] {
        var result: [String] = []
        var remaining = input[...]
        while let range = remaining.range(of: "volinfo=") {
            let start = range.upperBound
            let tail = remaining[start...]
            let end = tail.firstIndex { "\"'<)\r\n".contains($0) } ?? tail.endIndex
            let payload = String(tail[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !payload.isEmpty { result.append(payload) }
            remaining = tail[end...]
        }
        return result
    }

    private static func comicID(from value: String) -> String? {
        firstMatch(#"/c/([A-Za-z0-9_\-]+)(?:\.htm)?"#, in: value)
    }

    private static func absoluteURL(_ value: String, baseURL: URL) -> URL? {
        guard !value.isEmpty else { return nil }
        return URL(string: value, relativeTo: baseURL)?.absoluteURL
    }

    private static func string(_ value: Any?) -> String {
        switch value {
        case let value as String: value
        case let value as CustomStringConvertible: value.description
        default: ""
        }
    }

    private static func firstMatch(_ pattern: String, in input: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let range = NSRange(input.startIndex..<input.endIndex, in: input)
        guard let match = regex.firstMatch(in: input, range: range), match.numberOfRanges > 1, let group = Range(match.range(at: 1), in: input) else {
            return nil
        }
        return String(input[group])
    }

    static func stripHTML(_ input: String) -> String {
        input
            .replacingOccurrences(of: #"<script[\s\S]*?</script>"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"<style[\s\S]*?</style>"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

final class TVDatabase {
    private var db: OpaquePointer?

    init(path: URL = TVDatabase.defaultURL()) throws {
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard sqlite3_open(path.path, &db) == SQLITE_OK else {
            throw TVKmoeError.database(String(cString: sqlite3_errmsg(db)))
        }
        try exec("""
        CREATE TABLE IF NOT EXISTS reading_progress (
          comic_id TEXT NOT NULL,
          volume_id TEXT NOT NULL,
          page_index INTEGER NOT NULL,
          page_count INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (comic_id, volume_id)
        );
        CREATE TABLE IF NOT EXISTS reader_cache (
          id TEXT PRIMARY KEY,
          comic_id TEXT NOT NULL,
          volume_id TEXT NOT NULL,
          cache_dir TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """)
    }

    deinit {
        sqlite3_close(db)
    }

    func saveProgress(comicID: String, volumeID: String, pageIndex: Int, pageCount: Int) throws {
        let sql = """
        INSERT INTO reading_progress (comic_id, volume_id, page_index, page_count, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(comic_id, volume_id) DO UPDATE SET page_index=excluded.page_index, page_count=excluded.page_count, updated_at=excluded.updated_at
        """
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw TVKmoeError.database(lastError) }
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_text(statement, 1, comicID, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(statement, 2, volumeID, -1, SQLITE_TRANSIENT)
        sqlite3_bind_int(statement, 3, Int32(pageIndex))
        sqlite3_bind_int(statement, 4, Int32(pageCount))
        sqlite3_bind_text(statement, 5, ISO8601DateFormatter().string(from: Date()), -1, SQLITE_TRANSIENT)
        guard sqlite3_step(statement) == SQLITE_DONE else { throw TVKmoeError.database(lastError) }
    }

    func progressCount() throws -> Int {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM reading_progress", -1, &statement, nil) == SQLITE_OK else { throw TVKmoeError.database(lastError) }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return 0 }
        return Int(sqlite3_column_int(statement, 0))
    }

    private func exec(_ sql: String) throws {
        var error: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &error) != SQLITE_OK {
            defer { sqlite3_free(error) }
            throw TVKmoeError.database(error.map { String(cString: $0) } ?? lastError)
        }
    }

    private var lastError: String {
        db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
    }

    static func defaultURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("kmoelite-tv/kmoelite-tv.sqlite3", isDirectory: false)
    }
}

@MainActor
final class TVAppModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var isBusy = false
    @Published var status = "Apple TV 原生壳已启动。"
    @Published var lastError: String?
    @Published var catalog: [TVCatalogItem] = []
    @Published var selectedDetail: TVComicDetail?

    private let client = TVKmoeClient()
    private let database: TVDatabase?

    init() {
        database = try? TVDatabase()
    }

    func bootstrapFromSmokeEnvironment() async {
        guard let email = ProcessInfo.processInfo.environment["KMOELITE_TV_SMOKE_EMAIL"], let password = ProcessInfo.processInfo.environment["KMOELITE_TV_SMOKE_PASSWORD"], !email.isEmpty, !password.isEmpty else {
            status = database == nil ? "SQLite 初始化失败；请检查 App 私有存储。" : "等待登录。"
            return
        }
        await login(email: email, password: password)
    }

    func login(email: String, password: String) async {
        await run("正在登录真实 KMOE 站点…") {
            try await client.login(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
            isAuthenticated = true
            status = "登录成功，正在读取目录…"
            catalog = try await client.fetchCatalog()
            status = "目录已读取：\(catalog.count) 项。"
        }
    }

    func loadDetail(for item: TVCatalogItem) async {
        await run("正在读取详情：\(item.title)") {
            selectedDetail = try await client.fetchDetail(comicID: item.id)
            if let selectedDetail {
                status = "详情已读取：\(selectedDetail.chapters.count) 个 EPUB 章节。"
            }
        }
    }

    private func run(_ busyStatus: String, operation: () async throws -> Void) async {
        isBusy = true
        lastError = nil
        status = busyStatus
        do {
            try await operation()
        } catch {
            lastError = error.localizedDescription
            status = error.localizedDescription
        }
        isBusy = false
    }
}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }

    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
