FROM hashicorp/vault:latest

USER root
RUN apk add --no-cache jq
COPY entrypoint-vault.sh /usr/local/bin/entrypoint-vault.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint-vault.sh && chmod +x /usr/local/bin/entrypoint-vault.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/entrypoint-vault.sh"]
