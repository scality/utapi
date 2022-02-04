FROM registry.scality.com/vault-dev/vault:c2607856

ENV VAULT_DB_BACKEND LEVELDB

RUN chmod 400 tests/utils/keyfile

ENTRYPOINT yarn start

