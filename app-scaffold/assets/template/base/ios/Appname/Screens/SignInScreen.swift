import AuthenticationServices
import SwiftUI

/// The wall. There is no way past it without an account.
///
/// Facebook leads, because the paid traffic is Meta's. Apple sits above Google per Apple's
/// HIG, and guideline 4.8 requires it alongside any other provider anyway.
///
/// The subscription and the data are keyed on the account, so the copy says what the
/// account is for rather than "sign in to continue".
struct SignInScreen: View {
    @State private var showEmail = false

    var body: some View {
        Screen(scrolls: false) {
            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: Metric.Space.m) {
                Text("Appname").appnameEyebrow()
                Text("Sign in to Appname")
                    .font(Typeface.ui(34, .extrabold, relativeTo: .largeTitle))
                    .tracking(-0.68)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Your account keeps your subscription and what you save, on every device you use.")
                    .font(Typeface.ui(15, .regular, relativeTo: .subheadline))
                    .foregroundStyle(Palette.slate)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: Metric.Space.xl)

            SignInProviders(showEmail: $showEmail)

            Spacer(minLength: Metric.Space.xl)
        }
        .signingInOverlay()
    }
}

/// Facebook, Apple, Google and the email door, with the last error under them — the sign-in screen's
/// and the funnel's account step's.
struct SignInProviders: View {
    /// Handed up so a screen that does not scroll can drop what the form would push off it.
    @Binding var showEmail: Bool

    @Environment(AuthStore.self) private var auth
    @Environment(\.webAuthenticationSession) private var webAuthentication
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var emailStep = EmailStep.address
    @State private var isSending = false
    /// Seconds until another code may be asked for — the web's `RESEND_AFTER`.
    @State private var resendIn = 0

    var body: some View {
        VStack(spacing: Metric.Space.m) {
            // Facebook leads: the paid traffic is Meta's, so it is the door most are already
            // signed in to. Apple stays above Google.
            FacebookSignInButton {
                Task { await auth.signInWithFacebook(using: webAuthentication) }
            }

            SignInWithAppleButton(.signIn) { request in
                auth.requestAppleScopes(request)
            } onCompletion: { result in
                auth.signInWithApple(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: Metric.primaryButton)
            .clipShape(.rect(cornerRadius: Metric.Radius.card))

            // Google's own button, likewise: their mark, their colours, their wording.
            GoogleBrandSignInButton {
                guard let presenting = UIApplication.keyRootViewController else { return }
                Task { await auth.signInWithGoogle(presenting: presenting) }
            }

            if showEmail {
                emailForm
            } else {
                QuietButton(title: "Use email instead") { showEmail = true }
                // Nothing on this screen says "create an account", and every door here does.
                Text("New to Appname? Any of these creates your account.")
                    .font(Typeface.ui(12, .regular, relativeTo: .caption))
                    .foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let message = auth.errorMessage {
                Text(message)
                    .font(Typeface.ui(13, .regular, relativeTo: .footnote))
                    .foregroundStyle(Palette.alert)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// The emailed code, which signs in a known address and creates a new one — the web
    /// app's door, so an account made on either surface works on both. The password stays
    /// behind a quiet button for App Review's demo account, which cannot read a mailbox.
    @ViewBuilder
    private var emailForm: some View {
        Group {
            switch emailStep {
            case .address: addressForm
            case .code: codeForm
            case .password: passwordForm
            }
        }
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .task(id: resendIn) {
            guard resendIn > 0, (try? await Task.sleep(for: .seconds(1))) != nil else { return }
            resendIn -= 1
        }
    }

    private var addressForm: some View {
        VStack(spacing: Metric.Space.s) {
            RowCard {
                TextFieldRow(label: "Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
            }
            PrimaryButton(title: "Send me a code", enabled: trimmedEmail.contains("@") && !isSending) {
                Task { await sendCode() }
            }
            QuietButton(title: "Use a password instead") { emailStep = .password }
        }
    }

    private var codeForm: some View {
        VStack(spacing: Metric.Space.s) {
            Text("We sent a six-digit code to \(trimmedEmail).")
                .font(Typeface.ui(13, .regular, relativeTo: .footnote))
                .foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            RowCard {
                TextField(text: $code, prompt: Text(verbatim: "000000")) { EmptyView() }
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .multilineTextAlignment(.center)
                    .font(Typeface.mono(22, .medium, relativeTo: .title2))
                    .tracking(6)
                    .padding(.vertical, 14)
                    .onChange(of: code) { _, typed in
                        let digits = String(typed.filter(\.isNumber).prefix(6))
                        if digits != typed { code = digits }
                        if digits.count == 6 { verify(digits) }
                    }
            }
            PrimaryButton(title: "Sign in", enabled: code.count == 6) { verify(code) }
            QuietButton(title: resendIn > 0 ? "Send another in \(resendIn) s" : "Send another code") {
                Task { await sendCode() }
            }
            .disabled(resendIn > 0 || isSending)
            QuietButton(title: "Back") { emailStep = .address }
        }
    }

    /// Exists for App Review, which needs a demo account to get past this screen.
    private var passwordForm: some View {
        VStack(spacing: Metric.Space.s) {
            RowCard {
                TextFieldRow(label: "Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                RowDivider(inset: 0)
                HStack(spacing: Metric.Space.m) {
                    Text("Password")
                        .font(Typeface.ui(15, .regular, relativeTo: .subheadline))
                        .foregroundStyle(Palette.ink)
                    Spacer(minLength: Metric.Space.s)
                    SecureField(text: $password) { EmptyView() }
                        .multilineTextAlignment(.trailing)
                        .font(Typeface.ui(15, .medium, relativeTo: .subheadline))
                }
                .padding(.horizontal, Metric.cardPadding)
                .padding(.vertical, 14)
            }
            PrimaryButton(title: "Sign in", enabled: !email.isEmpty && !password.isEmpty) {
                Task { await auth.signInWithEmail(email: trimmedEmail, password: password) }
            }
            QuietButton(title: "Back") { emailStep = .address }
        }
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func sendCode() async {
        isSending = true
        defer { isSending = false }
        guard await auth.sendEmailCode(to: trimmedEmail) else { return }
        code = ""
        resendIn = 60
        emailStep = .code
    }

    private func verify(_ digits: String) {
        guard !auth.isAuthenticating else { return }
        Task {
            await auth.verifyEmailCode(email: trimmedEmail, code: digits)
            if !auth.isSignedIn { code = "" }
        }
    }

    private enum EmailStep { case address, code, password }
}

extension View {
    /// Over the whole screen while an exchange is in flight, and it takes the taps with it —
    /// the exchange is a network round trip and starting a second one on top of it is what a
    /// live Apple button invites.
    func signingInOverlay() -> some View {
        modifier(SigningInOverlay())
    }
}

private struct SigningInOverlay: ViewModifier {
    @Environment(AuthStore.self) private var auth

    func body(content: Content) -> some View {
        content
            .overlay { if auth.isAuthenticating { exchanging } }
            .animation(.easeInOut(duration: 0.2), value: auth.isAuthenticating)
    }

    /// The seconds after the provider hands control back.
    ///
    /// Apple's sheet and Google's browser both close the moment they are done, and what
    /// follows is a round trip to Supabase. Without this, the user lands back on the
    /// sign-in screen they thought they had finished with, and nothing says the tap worked.
    private var exchanging: some View {
        ZStack {
            Palette.canvas.opacity(0.96).ignoresSafeArea()
            VStack(spacing: Metric.Space.m) {
                ProgressView().tint(Palette.ink)
                Text("Signing you in").appnameTitle()
            }
        }
        .transition(.opacity)
    }
}
