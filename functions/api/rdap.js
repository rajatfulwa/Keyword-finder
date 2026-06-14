export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const parsedUrl = new URL(request.url);
    const domain = parsedUrl.searchParams.get("domain");

    if (!domain || !/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}$/i.test(domain)) {
      return new Response(JSON.stringify({ available: null, domain, error: "invalid" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const parts = domain.split(".");
    const tld = parts[parts.length - 1].toLowerCase();

    let rdapBase = "https://rdap.org/domain/";
    switch (tld) {
      case "com":
      case "net":
        rdapBase = "https://rdap.verisign.com/com/v1/domain/";
        break;
      case "io":
        rdapBase = "https://rdap.nic.io/domain/";
        break;
      case "app":
        rdapBase = "https://rdap.nic.app/domain/";
        break;
      case "co":
        rdapBase = "https://rdap.nic.co/domain/";
        break;
      case "dev":
        rdapBase = "https://rdap.nic.dev/domain/";
        break;
      case "org":
        rdapBase = "https://rdap.publicinterestregistry.org/rdap/domain/";
        break;
    }

    const rdapUrl = rdapBase + encodeURIComponent(domain);
    const rdapResponse = await fetch(rdapUrl);
    let result = { available: false, domain };

    if (rdapResponse.status === 200) {
      result.available = false;
    } else if (rdapResponse.status === 404) {
      result.available = true;
    } else {
      result = { available: null, domain, error: `rdap_${rdapResponse.status}` };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ available: null, domain: null, error: "timeout" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
