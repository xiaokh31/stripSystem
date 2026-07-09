package com.bestar.nativescan

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BestarQrScannerActivity : ComponentActivity() {
  private lateinit var cameraExecutor: ExecutorService
  private lateinit var previewView: PreviewView
  private val completed = AtomicBoolean(false)
  private val barcodeScanner: BarcodeScanner by lazy {
    BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    cameraExecutor = Executors.newSingleThreadExecutor()
    previewView = PreviewView(this)
    previewView.layoutParams =
        FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )

    val cancelButton =
        Button(this).apply {
          text = "Cancel"
          setOnClickListener {
            finishWithError("SCAN_CANCELLED", "Native camera scanner was cancelled.")
          }
        }
    val cancelParams =
        FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.END,
        )
    cancelParams.setMargins(24, 48, 24, 24)

    setContentView(
        FrameLayout(this).apply {
          setBackgroundColor(android.graphics.Color.BLACK)
          addView(previewView)
          addView(cancelButton, cancelParams)
        }
    )

    if (hasCameraPermission()) {
      startCamera()
    } else {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
    }
  }

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<out String>,
      grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != CAMERA_REQUEST) {
      return
    }

    if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      startCamera()
    } else {
      finishWithError("CAMERA_PERMISSION_DENIED", "Camera permission denied.")
    }
  }

  private fun hasCameraPermission(): Boolean =
      ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
          PackageManager.PERMISSION_GRANTED

  private fun startCamera() {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
    cameraProviderFuture.addListener(
        {
          try {
            val cameraProvider = cameraProviderFuture.get()
            val preview =
                Preview.Builder().build().also {
                  it.setSurfaceProvider(previewView.surfaceProvider)
                }
            val analyzer =
                ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { analysis ->
                      analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                        scanImageProxy(imageProxy)
                      }
                    }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                this,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analyzer,
            )
          } catch (error: Exception) {
            finishWithError(
                "CAMERA_START_FAILED",
                error.message ?: "Native camera scanner could not start.",
            )
          }
        },
        ContextCompat.getMainExecutor(this),
    )
  }

  @androidx.annotation.OptIn(ExperimentalGetImage::class)
  private fun scanImageProxy(imageProxy: ImageProxy) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
      imageProxy.close()
      return
    }

    val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    barcodeScanner
        .process(inputImage)
        .addOnSuccessListener { barcodes ->
          val payload =
              barcodes
                  .firstOrNull { barcode ->
                    barcode.format == Barcode.FORMAT_QR_CODE &&
                        !barcode.rawValue.isNullOrBlank()
                  }
                  ?.rawValue
                  ?.trim()
          if (!payload.isNullOrEmpty()) {
            finishWithPayload(payload)
          }
        }
        .addOnFailureListener { error ->
          finishWithError("QR_DECODE_FAILED", error.message ?: "QR decode failed.")
        }
        .addOnCompleteListener { imageProxy.close() }
  }

  private fun finishWithPayload(payload: String) {
    if (!completed.compareAndSet(false, true)) {
      return
    }
    setResult(Activity.RESULT_OK, Intent().putExtra(EXTRA_QR_PAYLOAD, payload))
    finish()
  }

  private fun finishWithError(code: String, message: String) {
    if (!completed.compareAndSet(false, true)) {
      return
    }
    setResult(
        Activity.RESULT_CANCELED,
        Intent().putExtra(EXTRA_ERROR_CODE, code).putExtra(EXTRA_ERROR_MESSAGE, message),
    )
    finish()
  }

  override fun onDestroy() {
    barcodeScanner.close()
    if (::cameraExecutor.isInitialized) {
      cameraExecutor.shutdown()
    }
    super.onDestroy()
  }

  companion object {
    const val EXTRA_QR_PAYLOAD = "bestar.extra.QR_PAYLOAD"
    const val EXTRA_ERROR_CODE = "bestar.extra.ERROR_CODE"
    const val EXTRA_ERROR_MESSAGE = "bestar.extra.ERROR_MESSAGE"
    private const val CAMERA_REQUEST = 6508
  }
}
