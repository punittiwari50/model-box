# syntax=docker/dockerfile:1.7
FROM nginx:1.27.3-alpine

ARG APP_USER=report_svc
ARG APP_UID=10002
ARG APP_GID=10002

RUN addgroup -g ${APP_GID} -S ${APP_USER} \
	&& adduser -u ${APP_UID} -S -D -h /home/${APP_USER} -G ${APP_USER} ${APP_USER}

RUN install -d -o ${APP_USER} -g ${APP_USER} -m 755 /var/cache/nginx /run/nginx /usr/share/nginx/html /etc/nginx/conf.d /tmp/nginx /var/log/nginx

COPY --chown=${APP_USER}:${APP_USER} --chmod=644 nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chown=${APP_USER}:${APP_USER} --chmod=644 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=${APP_USER}:${APP_USER} --chmod=644 nginx/startup.html /usr/share/nginx/html/__startup.html

USER ${APP_USER}

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]