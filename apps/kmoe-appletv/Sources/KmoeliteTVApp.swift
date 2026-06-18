import SwiftUI

@main
struct KmoeliteTVApp: App {
    @StateObject private var model = TVAppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var model: TVAppModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Color(red: 0.05, green: 0.05, blue: 0.06), Color(red: 0.16, green: 0.04, blue: 0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .ignoresSafeArea()

                VStack(alignment: .leading, spacing: 28) {
                    header
                    if model.isAuthenticated {
                        catalog
                    } else {
                        loginForm
                    }
                    Spacer(minLength: 0)
                    statusLine
                }
                .padding(.horizontal, 88)
                .padding(.vertical, 56)
            }
        }
        .task { await model.bootstrapFromSmokeEnvironment() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("kmoelite TV")
                .font(.system(size: 54, weight: .black, design: .rounded))
            Text("非官方 KMOE 在线漫画阅读 · Apple TV 原生预览")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private var loginForm: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("登录后会读取真实目录。密码只参与本次请求，不写入本地。")
                .foregroundStyle(.secondary)
            TextField("邮箱", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
            SecureField("密码", text: $password)
                .textContentType(.password)
            Button {
                Task { await model.login(email: email, password: password) }
            } label: {
                Label("登录并读取目录", systemImage: "person.crop.circle.badge.checkmark")
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isBusy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty)
        }
        .frame(maxWidth: 760, alignment: .leading)
    }

    private var catalog: some View {
        HStack(alignment: .top, spacing: 42) {
            ScrollView(.vertical) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 24)], spacing: 24) {
                    ForEach(model.catalog) { item in
                        Button {
                            Task { await model.loadDetail(for: item) }
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(item.title)
                                    .font(.title3.weight(.bold))
                                    .lineLimit(2)
                                Text(item.author ?? "KMOE")
                                    .font(.callout.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(item.latestVolume ?? "详情")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.tertiary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
                            .padding(22)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24))
                        }
                        .buttonStyle(.card)
                    }
                }
            }

            detailPanel
                .frame(width: 470)
        }
    }

    private var detailPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(model.selectedDetail?.title ?? "选择一本漫画")
                .font(.title2.weight(.black))
                .lineLimit(3)
            Text(model.selectedDetail?.description ?? "遥控器选择左侧条目后，会读取真实详情和可阅读章节。")
                .foregroundStyle(.secondary)
                .lineLimit(7)
            Divider()
            Text("可阅读 EPUB 章节")
                .font(.headline)
            if let detail = model.selectedDetail {
                if detail.chapters.isEmpty {
                    Text("当前详情未解析到 EPUB 章节。")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(detail.chapters.prefix(8)) { chapter in
                        HStack {
                            Text(chapter.title)
                                .lineLimit(1)
                            Spacer()
                            Text(chapter.sizeLabel)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding(26)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28))
    }

    private var statusLine: some View {
        Text(model.status)
            .font(.callout.weight(.semibold))
            .foregroundStyle(model.lastError == nil ? .secondary : Color(red: 1, green: 0.45, blue: 0.55))
            .lineLimit(2)
    }
}
