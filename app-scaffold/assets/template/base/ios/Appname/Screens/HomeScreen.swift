import SwiftUI

/// The placeholder main screen: the store's items, a field to add one, and the way to Profile.
/// Adding goes through `AppnameStore.add`, so an unpaid account meets the paywall here.
struct HomeScreen: View {
    @Environment(AppnameStore.self) private var store
    @State private var draft = ""

    var body: some View {
        Screen {
            ScreenHeader(title: "Items", subtitle: String(interface: "\(store.items.count) total")) {
                NavigationLink {
                    ProfileScreen().tracksScreen(.profile)
                } label: {
                    Glyph(symbol: "person", size: 17, weight: .semibold).glyphButtonFace()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Account"))
            }

            RowCard(raised: true) {
                HStack(spacing: Metric.Space.m) {
                    TextField(text: $draft, prompt: Text("Name")) { EmptyView() }
                        .font(Typeface.ui(16, .medium, relativeTo: .body))
                        .foregroundStyle(Palette.ink)
                        .submitLabel(.done)
                        .onSubmit(add)
                    HeaderButton(title: "Add item", action: add)
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.leading, Metric.cardPadding)
                .padding(.trailing, Metric.Space.s)
                .padding(.vertical, Metric.Space.s)
            }

            if !store.items.isEmpty {
                RowCard {
                    ForEach(Array(store.items.enumerated()), id: \.offset) { index, item in
                        if index > 0 { RowDivider() }
                        Text(verbatim: item)
                            .appnameRowTitle()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(Metric.cardPadding)
                    }
                }
            }
        }
    }

    /// The draft stays when the write is refused, so nothing typed is lost behind the paywall.
    private func add() {
        guard store.add(draft) else { return }
        draft = ""
    }
}
