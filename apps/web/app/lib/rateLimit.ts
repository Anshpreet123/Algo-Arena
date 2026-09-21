import Redis from "ioredis";

/**
 * Sliding-window rate limiter backed by a Redis sorted set.
 *
 * The client is a module-level singleton: the previous version constructed a
 * new Redis connection on every call and never closed it, which leaked a
 * socket per request.
 */
let client: Redis | null = null;
let clientFailed = false;

function getRedisClient(): Redis | null {
  if (clientFailed) return null;
  if (!process.env.REDIS_URL) return null;

  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    client.on("error", (err) => {
      console.error("[rateLimit] redis error:", err.message);
    });
  }
  return client;
}

/**
 * Returns true when the action is allowed.
 *
 * When REDIS_URL is not configured the limiter is disabled rather than
 * blocking everything — otherwise a local checkout with no Redis cannot
 * submit at all. When Redis *is* configured but unreachable we fail closed,
 * because that is a real outage and not a configuration choice.
 */
export async function rateLimit(
  userId: string,
  limit: number,
  durationSeconds: number,
  bucket = "submit",
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    if (!process.env.REDIS_URL) {
      console.warn("[rateLimit] REDIS_URL unset — rate limiting is disabled");
    }
    return true;
  }

  const key = `rate_limit:${bucket}:${userId}`;
  const now = Date.now();
  const windowStart = now - durationSeconds * 1000;

  try {
    const results = await redis
      .multi()
      .zremrangebyscore(key, 0, windowStart)
      // A unique member per request: using the timestamp as the member made
      // two requests in the same second collapse into one, undercounting.
      .zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 10)}`)
      .zcard(key)
      .pexpire(key, durationSeconds * 1000 + 1000)
      .exec();

    const count = results?.[2]?.[1] as number | undefined;
    return typeof count === "number" ? count <= limit : true;
  } catch (error) {
    console.error("[rateLimit] failing closed:", error);
    clientFailed = false; // allow a later request to retry the connection
    return false;
  }
}
