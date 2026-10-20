import StoreKit
import SwiftUI

/// The account: who is signed in, the subscription and how to manage it, and the ways out.
struct ProfileScreen: View {
    @Environment(AppnameStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @Environment(PurchaseStore.self) private var purchases
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false
    /// Shown rather than swallowed: somebody who asked to be erased and was not has to be told.
    @State private var deleteError: DisplayMessage?
    @State private var manageError = false
    @State private var showsManageSheet = false
    @State private var paywall: PaywallContext?
    @AppStorage(InterfaceLanguage.overrideKey) private var language = "en"

    var body: some View {
        Screen {
            ScreenHeader(title: "Account", subtitle: auth.currentUser?.email ?? "", onBack: { dismiss() })

            RowCard(raised: true) {
                if purchases.isPaid {
                    row(String(interface: "Manage subscription")) { manage() }
                } else {
                    row(String(interface: "Subscribe")) { paywall = .settings }
                }
                RowDivider(inset: 0)
                row(String(interface: "Restore purchases"), busy: purchases.isRestoring) {
                    Task { await purchases.restore() }
                }
            }

            RowCard { languageMenu }

            RowCard {
                row(String(interface: "Sign out")) {
                    Analytics.shared.track(.signedOut)
                    store.reset()
                    auth.signOut()
                }
                RowDivider(inset: 0)
                // Guideline 5.1.1(v): an app that makes you sign in has to let you erase the account.
                Button(role: .destructive) { showDeleteConfirm = true } label: {
                    HStack {
                        Text("Delete account")
                            .font(Typeface.ui(16, .semibold, relativeTo: .subheadline))
                            .foregroundStyle(Palette.alert)
                        Spacer()
                        if isDeleting { ProgressView() }
                    }
                    .padding(Metric.cardPadding)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .disabled(isDeleting)
                .confirmationDialog("Delete your account?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                    Button("Delete everything", role: .destructive) { deleteAccount() }
                } message: {
                    Text("Everything you've saved goes with it, on every device. This cannot be undone. An active subscription keeps running until you cancel it.")
                }
            }

            if let deleteError {
                Text(deleteError).appnameCaption(Palette.alert)
            }
            if manageError {
                Text("The subscription page didn't open. Try again, or use the link in your receipt email.")
                    .appnameCaption(Palette.alert)
            }
        }
        .manageSubscriptionsSheet(isPresented: $showsManageSheet, subscriptionGroupID: purchases.subscriptionGroupID ?? "")
        .fullScreenCover(item: $paywall) { PaywallScreen(context: $0) }
        .task {
            if !purchases.didLoadProducts { await purchases.loadProducts() }
        }
    }

    /// An App Store subscription is managed in StoreKit's sheet; one sold on the web, in its
    /// biller's portal, which the backend mints.
    private func manage() {
        manageError = false
        guard purchases.isWebSubscription else {
            showsManageSheet = true
            return
        }
        Task {
            if let url = await purchases.webPortalURL() {
                openURL(url)
            } else {
                manageError = true
            }
        }
    }

    /// Each language is named in itself, so somebody stuck in one they cannot read still finds theirs.
    private var languageMenu: some View {
        Menu {
            Picker("Language", selection: Binding(get: { language }, set: InterfaceLanguage.select)) {
                ForEach(InterfaceLanguage.supported, id: \.self) { tag in
                    Text(verbatim: InterfaceLanguage.displayName(tag)).tag(tag)
                }
            }
        } label: {
            HStack {
                Text("Language").appnameRowTitle()
                Spacer()
                Text(verbatim: InterfaceLanguage.displayName(language)).appnameCaption()
                Glyph.caret(Palette.muted)
            }
            .padding(Metric.cardPadding)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func row(_ title: String, busy: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(verbatim: title).appnameRowTitle()
                Spacer()
                if busy { ProgressView() }
            }
            .padding(Metric.cardPadding)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    /// The local wipe happens only after the server confirms, so a failed call never leaves
    /// somebody signed out of an account that still exists.
    private func deleteAccount() {
        isDeleting = true
        deleteError = nil
        Task {
            let service = AccountService(accessToken: { await auth.accessToken() })
            if let failure = await service.delete() {
                deleteError = failure
            } else {
                Analytics.shared.track(.accountDeleted)
                store.reset()
                auth.signOut()
            }
            isDeleting = false
        }
    }
}
