package com.bestar.nativescan

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BestarQrScannerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
  private var pendingPromise: Promise? = null

  private val activityEventListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != REQUEST_CODE) {
            return
          }

          val promise = pendingPromise ?: return
          pendingPromise = null

          if (resultCode == Activity.RESULT_OK) {
            val payload = data?.getStringExtra(BestarQrScannerActivity.EXTRA_QR_PAYLOAD)?.trim()
            if (payload.isNullOrEmpty()) {
              promise.reject("EMPTY_QR_PAYLOAD", "Native camera scanner returned an empty QR payload.")
            } else {
              promise.resolve(payload)
            }
            return
          }

          val code =
              data?.getStringExtra(BestarQrScannerActivity.EXTRA_ERROR_CODE) ?: "SCAN_CANCELLED"
          val message =
              data?.getStringExtra(BestarQrScannerActivity.EXTRA_ERROR_MESSAGE)
                  ?: "Native camera scanner was cancelled."
          promise.reject(code, message)
        }
      }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun scanOnce(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("SCAN_IN_PROGRESS", "A native camera scan is already in progress.")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Native camera scanner requires a foreground activity.")
      return
    }

    pendingPromise = promise
    try {
      activity.startActivityForResult(
          Intent(activity, BestarQrScannerActivity::class.java),
          REQUEST_CODE,
      )
    } catch (error: Exception) {
      pendingPromise = null
      promise.reject("CAMERA_LAUNCH_FAILED", "Native camera scanner could not open.", error)
    }
  }

  override fun invalidate() {
    pendingPromise?.reject("MODULE_INVALIDATED", "BestarQrScanner was invalidated.")
    pendingPromise = null
    reactContext.removeActivityEventListener(activityEventListener)
    super.invalidate()
  }

  companion object {
    const val NAME = "BestarQrScanner"
    private const val REQUEST_CODE = 6509
  }
}
