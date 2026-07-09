package com.bestar.nativescan

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class BestarSecureTokenStoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private val preferences =
      reactContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  override fun getName(): String = NAME

  @ReactMethod
  fun getToken(promise: Promise) {
    try {
      val ciphertext = preferences.getString(CIPHERTEXT_KEY, null)
      val iv = preferences.getString(IV_KEY, null)
      if (ciphertext.isNullOrBlank() || iv.isNullOrBlank()) {
        promise.resolve(null)
        return
      }

      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateSecretKey(),
          GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)),
      )
      val plaintext = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
      val token = String(plaintext, Charsets.UTF_8)
      promise.resolve(if (token.isBlank()) null else token)
    } catch (error: Exception) {
      promise.reject(
          "SECURE_TOKEN_STORE_READ_FAILED",
          "Auth token could not be read from Android Keystore-backed storage.",
          error,
      )
    }
  }

  @ReactMethod
  fun setToken(token: String, promise: Promise) {
    if (token.isBlank()) {
      promise.reject("SECURE_TOKEN_STORE_EMPTY_TOKEN", "Cannot store an empty auth token.")
      return
    }

    try {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
      val ciphertext = cipher.doFinal(token.toByteArray(Charsets.UTF_8))

      val committed =
          preferences
          .edit()
          .putString(CIPHERTEXT_KEY, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
          .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
          .commit()
      if (!committed) {
        promise.reject(
            "SECURE_TOKEN_STORE_WRITE_FAILED",
            "Auth token could not be committed to secure storage.",
        )
        return
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
          "SECURE_TOKEN_STORE_WRITE_FAILED",
          "Auth token could not be stored with Android Keystore.",
          error,
      )
    }
  }

  @ReactMethod
  fun clearToken(promise: Promise) {
    try {
      val committed = preferences.edit().remove(CIPHERTEXT_KEY).remove(IV_KEY).commit()
      if (!committed) {
        promise.reject(
            "SECURE_TOKEN_STORE_CLEAR_FAILED",
            "Auth token clear could not be committed to secure storage.",
        )
        return
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
          "SECURE_TOKEN_STORE_CLEAR_FAILED",
          "Auth token could not be cleared from secure storage.",
          error,
      )
    }
  }

  private fun getOrCreateSecretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
    keyStore.load(null)

    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    val spec =
        KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_SIZE_BITS)
            .build()
    keyGenerator.init(spec)
    return keyGenerator.generateKey()
  }

  companion object {
    const val NAME = "BestarSecureTokenStore"

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val CIPHERTEXT_KEY = "jwt_ciphertext"
    private const val GCM_TAG_LENGTH_BITS = 128
    private const val IV_KEY = "jwt_iv"
    private const val KEY_ALIAS = "bestar_native_scan_token_key"
    private const val KEY_SIZE_BITS = 256
    private const val PREFERENCES_NAME = "bestar_secure_token_store"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
