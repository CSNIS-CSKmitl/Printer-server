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

# Install pdftopjlff wrapper (handles PDF -> PJL with page count logging, N-up translation & job name)
cat << 'EOF' > "$FILTER_DIR/pdftopjlff"
#!/bin/bash
set -o pipefail

ORIG_BIN="/usr/lib/cups/filter/pdftopjlff.orig"

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
CLEAN_TITLE=$(echo "$JOB_TITLE" | tr -d '"\r\n\\')

# Run original filter with enhanced options and inject PJL authentication & job name headers
"$ORIG_BIN" "$1" "$2" "$3" "$4" "$OPTIONS" "$INFILE" | awk -v u="printerserver" -v p="cskmitl" -v t="$CLEAN_TITLE" '{
    print $0
    if ($0 ~ /@PJL COMMENT Version:4.00/) {
        print "@PJL SET JOBNAME=\"" t "\""
        print "@PJL SET USERNAME=\"" u "\""
        print "@PJL SET JOBATTR=\"@JOAU=" u "\""
        print "@PJL SET JOBATTR=\"@JOAP=" p "\""
        print "@PJL SET JOBATTR=\"@JONA=" t "\""
    }
}'
STATUS=$?

if [ -n "$TMPFILE" ]; then
    rm -f "$TMPFILE"
fi

exit $STATUS
EOF

# Install pstopdfff wrapper (handles PS -> PJL)
cat << 'EOF' > "$FILTER_DIR/pstopdfff"
#!/bin/bash
set -o pipefail

ORIG_BIN="/usr/lib/cups/filter/pstopdfff.orig"

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
CLEAN_TITLE=$(echo "$JOB_TITLE" | tr -d '"\r\n\\')

"$ORIG_BIN" "$1" "$2" "$3" "$4" "$OPTIONS" "$INFILE" | awk -v u="printerserver" -v p="cskmitl" -v t="$CLEAN_TITLE" '{
    print $0
    if ($0 ~ /@PJL COMMENT Version:4.00/) {
        print "@PJL SET JOBNAME=\"" t "\""
        print "@PJL SET USERNAME=\"" u "\""
        print "@PJL SET JOBATTR=\"@JOAU=" u "\""
        print "@PJL SET JOBATTR=\"@JOAP=" p "\""
        print "@PJL SET JOBATTR=\"@JONA=" t "\""
    }
}'
STATUS=$?

if [ -n "$TMPFILE" ]; then
    rm -f "$TMPFILE"
fi

exit $STATUS
EOF

chmod 755 "$FILTER_DIR/pdftopjlff" "$FILTER_DIR/pstopdfff"
chown root:root "$FILTER_DIR/pdftopjlff" "$FILTER_DIR/pstopdfff"
systemctl restart cups

echo "CUPS Fujifilm authentication & N-up filter setup completed successfully."
