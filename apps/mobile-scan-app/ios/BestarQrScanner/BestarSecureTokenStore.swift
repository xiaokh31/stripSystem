import Foundation
import React
import Security

@objc(BestarSecureTokenStore)
final class BestarSecureTokenStore: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func getToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    var query = keychainQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      resolve(nil)
      return
    }
    guard status == errSecSuccess else {
      reject(
        "SECURE_TOKEN_STORE_READ_FAILED",
        "Auth token could not be read from iOS Keychain.",
        nil
      )
      return
    }
    guard let data = item as? Data, let token = String(data: data, encoding: .utf8) else {
      reject("SECURE_TOKEN_STORE_READ_FAILED", "Stored auth token is not valid UTF-8.", nil)
      return
    }
    resolve(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : token)
  }

  @objc
  func setToken(
    _ token: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      reject("SECURE_TOKEN_STORE_EMPTY_TOKEN", "Cannot store an empty auth token.", nil)
      return
    }
    guard let data = token.data(using: .utf8) else {
      reject("SECURE_TOKEN_STORE_WRITE_FAILED", "Auth token is not valid UTF-8.", nil)
      return
    }

    let updateAttributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    var status = SecItemUpdate(
      keychainQuery() as CFDictionary,
      updateAttributes as CFDictionary
    )
    if status == errSecItemNotFound {
      var attributes = keychainQuery()
      attributes.merge(updateAttributes) { _, replacement in replacement }
      status = SecItemAdd(attributes as CFDictionary, nil)
    }
    guard status == errSecSuccess else {
      reject(
        "SECURE_TOKEN_STORE_WRITE_FAILED",
        "Auth token could not be stored in iOS Keychain.",
        nil
      )
      return
    }
    resolve(nil)
  }

  @objc
  func clearToken(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let status = SecItemDelete(keychainQuery() as CFDictionary)
    if status == errSecSuccess || status == errSecItemNotFound {
      resolve(nil)
      return
    }
    reject(
      "SECURE_TOKEN_STORE_CLEAR_FAILED",
      "Auth token could not be cleared from iOS Keychain.",
      nil
    )
  }

  private func keychainQuery() -> [String: Any] {
    [
      kSecAttrAccount as String: "jwt",
      kSecAttrService as String: "com.bestar.nativescan.auth",
      kSecClass as String: kSecClassGenericPassword,
    ]
  }
}
