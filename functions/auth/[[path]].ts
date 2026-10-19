import app from '../../server/app';
import type {Env} from '../../server/types';
export const onRequest: PagesFunction<Env> = context => app.fetch(context.request,context.env,{waitUntil:context.waitUntil.bind(context),passThroughOnException:context.passThroughOnException.bind(context),props:{}});
