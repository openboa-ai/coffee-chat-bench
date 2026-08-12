FROM --platform=linux/arm64 python@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a
WORKDIR /app
WORKDIR /tests
COPY verifier.py /tests/verifier.py
COPY test.sh /tests/test.sh
RUN chmod 0555 /tests/test.sh
