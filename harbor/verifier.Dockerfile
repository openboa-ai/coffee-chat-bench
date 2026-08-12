FROM python:3.13-alpine
WORKDIR /tests
COPY verifier.py /tests/verifier.py
COPY test.sh /tests/test.sh
RUN chmod 0555 /tests/test.sh
