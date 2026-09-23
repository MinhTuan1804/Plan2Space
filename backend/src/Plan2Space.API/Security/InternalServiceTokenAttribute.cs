using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Plan2Space.API.Security;

// Requires header X-Internal-Token to equal config "Internal:ServiceToken". Fails closed when unconfigured.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class InternalServiceTokenAttribute : Attribute, IAuthorizationFilter
{
    public const string HeaderName = "X-Internal-Token";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var expected = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Internal:ServiceToken"];
        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrEmpty(expected) || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(provided)))
            context.Result = new UnauthorizedResult();
    }
}
