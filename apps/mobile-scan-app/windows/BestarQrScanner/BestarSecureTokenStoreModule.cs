using System;
using System.Threading.Tasks;
using Microsoft.ReactNative.Managed;
using Windows.Security.Credentials;

namespace Bestar.NativeScan;

[ReactModule("BestarSecureTokenStore")]
public sealed class BestarSecureTokenStoreModule
{
    private const string ResourceName = "com.bestar.nativescan.auth";
    private const string UserName = "jwt";

    [ReactMethod("getToken")]
    public async Task GetToken(IReactPromise<object> promise)
    {
        await Task.Yield();
        try
        {
            var vault = new PasswordVault();
            PasswordCredential credential;
            try
            {
                credential = vault.Retrieve(ResourceName, UserName);
            }
            catch (Exception error) when (IsCredentialNotFound(error))
            {
                promise.Resolve(null);
                return;
            }

            credential.RetrievePassword();
            promise.Resolve(string.IsNullOrWhiteSpace(credential.Password) ? null : credential.Password);
        }
        catch (Exception error)
        {
            promise.Reject(new ReactError
            {
                Code = "SECURE_TOKEN_STORE_READ_FAILED",
                Message = $"Auth token could not be read from Windows Credential Locker: {error.Message}",
            });
        }
    }

    [ReactMethod("setToken")]
    public async Task SetToken(string token, IReactPromise<object> promise)
    {
        await Task.Yield();
        if (string.IsNullOrWhiteSpace(token))
        {
            promise.Reject(new ReactError
            {
                Code = "SECURE_TOKEN_STORE_EMPTY_TOKEN",
                Message = "Cannot store an empty auth token.",
            });
            return;
        }

        try
        {
            var vault = new PasswordVault();
            ClearCredential(vault);
            vault.Add(new PasswordCredential(ResourceName, UserName, token));
            promise.Resolve(null);
        }
        catch (Exception error)
        {
            promise.Reject(new ReactError
            {
                Code = "SECURE_TOKEN_STORE_WRITE_FAILED",
                Message = $"Auth token could not be stored in Windows Credential Locker: {error.Message}",
            });
        }
    }

    [ReactMethod("clearToken")]
    public async Task ClearToken(IReactPromise<object> promise)
    {
        await Task.Yield();
        try
        {
            ClearCredential(new PasswordVault());
            promise.Resolve(null);
        }
        catch (Exception error)
        {
            promise.Reject(new ReactError
            {
                Code = "SECURE_TOKEN_STORE_CLEAR_FAILED",
                Message = $"Auth token could not be cleared from Windows Credential Locker: {error.Message}",
            });
        }
    }

    private static void ClearCredential(PasswordVault vault)
    {
        try
        {
            vault.Remove(vault.Retrieve(ResourceName, UserName));
        }
        catch (Exception error) when (IsCredentialNotFound(error))
        {
        }
    }

    private static bool IsCredentialNotFound(Exception error)
    {
        return unchecked((uint)error.HResult) == 0x80070490;
    }
}
