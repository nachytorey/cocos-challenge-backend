// Smoke test de latencia para SC-005: p95 < 1 s en portfolio y búsqueda (principio XI).
//
// Requiere la API levantada con un rate limit alto, para que el limiter no contamine la medición
// (el rate limit se prueba aparte, en los tests funcionales):
//
//   RATE_LIMIT_MAX=100000 npm run dev
//   BASE_URL=http://localhost:3000 npm run test:load
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const requests = [
  { name: 'portfolio', path: '/v1/users/1/portfolio' },
  { name: 'search by ticker', path: '/v1/instruments?q=pam' },
  { name: 'search by name', path: '/v1/instruments?q=holding&limit=10' },
];

export default function () {
  for (const { name, path } of requests) {
    const res = http.get(`${BASE_URL}${path}`, { tags: { name } });
    check(res, { [`${name}: status 200`]: (r) => r.status === 200 });
  }
}
