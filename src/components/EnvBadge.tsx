import React from 'react';
import { getEnv } from '@/config/public';

export default function EnvBadge() {
  const env = getEnv();
  const tag = env.dev ? 'DEV' : env.preview ? 'PREVIEW' : 'PROD';
  return (
    <div className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs border" style={{background:'#f8fafc'}}> 
      <span className="font-semibold">ENV:</span> {tag}
      <span className="opacity-70">host:</span> {env.host}
      <span className="opacity-70">framed:</span> {String(env.framed)}
    </div>
  );
}