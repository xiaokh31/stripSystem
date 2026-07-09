using System.Threading.Tasks;
using Microsoft.ReactNative.Managed;

namespace Bestar.NativeScan;

[ReactModule("BestarQrScanner")]
public sealed class BestarQrScannerModule
{
    [ReactMethod("scanOnce")]
    public async Task ScanOnce(IReactPromise<string> promise)
    {
        await Task.Yield();
        promise.Reject(new ReactError
        {
            Code = "WINDOWS_CAMERA_NOT_WIRED",
            Message = "Windows native camera QR scanning requires the generated React Native Windows solution and a reviewed QR decoder dependency.",
        });
    }
}
