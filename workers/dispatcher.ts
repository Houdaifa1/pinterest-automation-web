interface DispatcherEnv {
  APP_ORIGIN: string;
  DISPATCH_KEY: string;
}
export default {
  async scheduled(
    _event: ScheduledController,
    env: DispatcherEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        const response = await fetch(`${env.APP_ORIGIN}/api/internal/tick`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.DISPATCH_KEY}` },
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok)
          throw Error(`Schedule check failed (${response.status})`);
        await response.body?.cancel();
      })(),
    );
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
