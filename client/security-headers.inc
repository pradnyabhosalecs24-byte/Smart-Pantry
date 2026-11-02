# Included by nginx.conf (keep in sync with security-headers.json)
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://www.themealdb.com; media-src 'self' blob:; connect-src 'self'; frame-src https://www.youtube-nocookie.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), payment=()" always;
add_header X-Frame-Options "DENY" always;
