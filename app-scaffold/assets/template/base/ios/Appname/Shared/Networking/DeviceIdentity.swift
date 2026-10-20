import UIKit

/// Stable per-install identity, recorded as a label on entitlement rows so a
/// purchase can be traced back to the install it came from. Never a security
/// boundary and never an identity: access is decided by the signed-in account
/// alone — see `lib/supabase/auth.ts` on the server.
enum DeviceIdentity {
    private static let key = "appname.deviceId"

    static let current: String = {
        if let saved = UserDefaults.standard.string(forKey: key) { return saved }
        let fresh = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        UserDefaults.standard.set(fresh, forKey: key)
        return fresh
    }()
}
