#!/bin/bash
# Script to install CUPS filter wrappers for Fujifilm Apeos printers with User Authentication & N-up Support
set -euo pipefail

FILTER_DIR="/usr/lib/cups/filter"
USER_NAME="${FUJI_AUTH_USER:-printerserver}"
USER_PASS="${FUJI_AUTH_PASS:-cskmitl}"

echo "Configuring CUPS filter wrappers for user '$USER_NAME'..."

# Backup original binaries
for bin in pdftopjlff pstopdfff; do
  if [ -f "$FILTER_DIR/$bin" ] && [ ! -f "$FILTER_DIR/$bin.orig" ]; then
    echo "Backing up $FILTER_DIR/$bin -> $FILTER_DIR/$bin.orig"
    cp -p "$FILTER_DIR/$bin" "$FILTER_DIR/$bin.orig"
  fi
done

# Install pdftopjlff wrapper (handles PDF -> PJL with page count logging, N-up translation & binary-safe PJL auth injection)
cat << 'EOF' > "$FILTER_DIR/pdftopjlff"
#!/bin/bash
set -o pipefail

ORIG_BIN="/usr/lib/cups/filter/pdftopjlff.orig"
FUJI_U="__FUJI_USER__"
FUJI_P="__FUJI_PASS__"

if [ -n "$6" ]; then
    INFILE="$6"
    TMPFILE=""
else
    TMPFILE=$(mktemp /tmp/cups_in_XXXXXX.pdf)
    cat > "$TMPFILE"
    INFILE="$TMPFILE"
fi

# Parse options and detect N-up (pages per sheet)
OPTIONS="${5:-}"
NUP=1
if echo "$OPTIONS" | grep -q -E "(number-up=2|FFLayout=2up)"; then
    NUP=2
    if ! echo "$OPTIONS" | grep -q "FFLayout="; then
        OPTIONS="$OPTIONS FFLayout=2up"
    fi
elif echo "$OPTIONS" | grep -q -E "(number-up=4|FFLayout=4up)"; then
    NUP=4
    if ! echo "$OPTIONS" | grep -q "FFLayout="; then
        OPTIONS="$OPTIONS FFLayout=4up"
    fi
elif echo "$OPTIONS" | grep -q -E "(number-up=8|FFLayout=8up)"; then
    NUP=8
    if ! echo "$OPTIONS" | grep -q "FFLayout="; then
        OPTIONS="$OPTIONS FFLayout=8up"
    fi
elif echo "$OPTIONS" | grep -q -E "(number-up=16|FFLayout=16up)"; then
    NUP=16
    if ! echo "$OPTIONS" | grep -q "FFLayout="; then
        OPTIONS="$OPTIONS FFLayout=16up"
    fi
fi

# Count pages from PDF and report sheets to CUPS via stderr for page_log
PAGES=$(pdfinfo "$INFILE" 2>/dev/null | awk '/Pages:/ {print $2}')
COPIES="${4:-1}"
if ! [[ "$COPIES" =~ ^[0-9]+$ ]] || [ "$COPIES" -lt 1 ]; then
    COPIES=1
fi

if [ -n "$PAGES" ] && [ "$PAGES" -gt 0 ]; then
    SHEETS_PER_COPY=$(( (PAGES + NUP - 1) / NUP ))
    for ((p=1; p<=SHEETS_PER_COPY; p++)); do
        >&2 echo "PAGE: $p $COPIES"
    done
    >&2 echo "PAGE: total $((SHEETS_PER_COPY * COPIES))"
fi

# Clean job title for PJL
JOB_TITLE="${3:-Print Job}"
CLEAN_TITLE=$(printf '%s' "$JOB_TITLE" | tr -d '"\r\n\\')

# Run original filter and inject PJL auth & job name headers in binary-safe mode
# (Never pipe raw PDF binary streams through text-mode awk, which can corrupt NUL/non-UTF-8 bytes and trigger 016-751)
"$ORIG_BIN" "$1" "$2" "$3" "$4" "$OPTIONS" "$INFILE" | FUJI_U="$FUJI_U" FUJI_P="$FUJI_P" FUJI_T="$CLEAN_TITLE" python3 -c '
import os, sys, shutil
u = os.environ["FUJI_U"].encode("ascii", "ignore")
p = os.environ["FUJI_P"].encode("ascii", "ignore")
t = os.environ["FUJI_T"].encode("utf-8", "ignore")
marker = b"@PJL COMMENT Version:4.00"
inject = (
    b"@PJL SET JOBNAME=\"" + t + b"\"\r\n"
    b"@PJL SET USERNAME=\"" + u + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JOAU=" + u + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JOAP=" + p + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JONA=" + t + b"\"\r\n"
)
inp = sys.stdin.buffer
out = sys.stdout.buffer
while True:
    line = inp.readline()
    if not line:
        break
    out.write(line)
    if marker in line:
        out.write(inject)
        shutil.copyfileobj(inp, out, 65536)
        break
out.flush()
'
STATUS=$?

if [ -n "$TMPFILE" ]; then
    rm -f "$TMPFILE"
fi

exit $STATUS
EOF

# Install pstopdfff wrapper (handles PS -> PJL with binary-safe PJL auth injection)
cat << 'EOF' > "$FILTER_DIR/pstopdfff"
#!/bin/bash
set -o pipefail

ORIG_BIN="/usr/lib/cups/filter/pstopdfff.orig"
FUJI_U="__FUJI_USER__"
FUJI_P="__FUJI_PASS__"

if [ -n "$6" ]; then
    INFILE="$6"
    TMPFILE=""
else
    TMPFILE=$(mktemp /tmp/cups_in_XXXXXX.ps)
    cat > "$TMPFILE"
    INFILE="$TMPFILE"
fi

OPTIONS="${5:-}"
if echo "$OPTIONS" | grep -q -E "(number-up=2|FFLayout=2up)" && ! echo "$OPTIONS" | grep -q "FFLayout="; then
    OPTIONS="$OPTIONS FFLayout=2up"
elif echo "$OPTIONS" | grep -q -E "(number-up=4|FFLayout=4up)" && ! echo "$OPTIONS" | grep -q "FFLayout="; then
    OPTIONS="$OPTIONS FFLayout=4up"
fi

JOB_TITLE="${3:-Print Job}"
CLEAN_TITLE=$(printf '%s' "$JOB_TITLE" | tr -d '"\r\n\\')

"$ORIG_BIN" "$1" "$2" "$3" "$4" "$OPTIONS" "$INFILE" | FUJI_U="$FUJI_U" FUJI_P="$FUJI_P" FUJI_T="$CLEAN_TITLE" python3 -c '
import os, sys, shutil
u = os.environ["FUJI_U"].encode("ascii", "ignore")
p = os.environ["FUJI_P"].encode("ascii", "ignore")
t = os.environ["FUJI_T"].encode("utf-8", "ignore")
marker = b"@PJL COMMENT Version:4.00"
inject = (
    b"@PJL SET JOBNAME=\"" + t + b"\"\r\n"
    b"@PJL SET USERNAME=\"" + u + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JOAU=" + u + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JOAP=" + p + b"\"\r\n"
    b"@PJL SET JOBATTR=\"@JONA=" + t + b"\"\r\n"
)
inp = sys.stdin.buffer
out = sys.stdout.buffer
while True:
    line = inp.readline()
    if not line:
        break
    out.write(line)
    if marker in line:
        out.write(inject)
        shutil.copyfileobj(inp, out, 65536)
        break
out.flush()
'
STATUS=$?

if [ -n "$TMPFILE" ]; then
    rm -f "$TMPFILE"
fi

exit $STATUS
EOF

# Substitute configured credentials safely
sed -i "s|__FUJI_USER__|${USER_NAME}|g; s|__FUJI_PASS__|${USER_PASS}|g" "$FILTER_DIR/pdftopjlff" "$FILTER_DIR/pstopdfff"

chmod 755 "$FILTER_DIR/pdftopjlff" "$FILTER_DIR/pstopdfff"
chown root:root "$FILTER_DIR/pdftopjlff" "$FILTER_DIR/pstopdfff"
systemctl restart cups

echo "CUPS Fujifilm authentication & N-up filter setup completed successfully."
