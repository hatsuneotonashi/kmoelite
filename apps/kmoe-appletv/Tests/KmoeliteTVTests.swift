import XCTest
@testable import KmoeliteAppleTV

final class KmoeliteTVTests: XCTestCase {
    func testCatalogParserReadsSiteShape() throws {
        let json = """
        {"data":[{"url_book":"/c/10817.htm","name":"<b>作品</b>","author":"作者","url_cover":"/cover.jpg","newvol":"卷 01"}]}
        """.data(using: .utf8)!
        let items = try TVKmoeParser.parseCatalog(json, baseURL: URL(string: "https://kxo.moe")!)
        XCTAssertEqual(items.first?.id, "10817")
        XCTAssertEqual(items.first?.title, "作品")
        XCTAssertEqual(items.first?.coverURL?.absoluteString, "https://kxo.moe/cover.jpg")
    }

    func testBookDataParserKeepsOnlyEpubRows() {
        let rows = #"volinfo=1001,0,0,0,0,卷 01,0,0,0,10,0,25.5); volinfo=1002,0,0,0,0,卷 02,0,0,0,10,0,0)"#
        let chapters = TVKmoeParser.parseEpubChapters(rows)
        XCTAssertEqual(chapters, [TVChapter(id: "1001", title: "卷 01", epubSizeMB: 25.5)])
    }

    func testSQLiteProgressRoundTrip() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let db = try TVDatabase(path: dir.appendingPathComponent("test.sqlite3"))
        try db.saveProgress(comicID: "10817", volumeID: "1001", pageIndex: 2, pageCount: 10)
        XCTAssertEqual(try db.progressCount(), 1)
    }

    func testLoginAndProfileMarkers() {
        XCTAssertTrue(TVKmoeClient.loginSucceeded("display_codeinfo(\"m100\")"))
        XCTAssertFalse(TVKmoeClient.loginSucceeded("display_codeinfo(\"e400\")"))
        XCTAssertTrue(TVKmoeClient.profileAuthenticated("KMOE ID logout"))
    }
}
