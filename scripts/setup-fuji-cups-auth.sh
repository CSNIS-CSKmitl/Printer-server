#!/bin/bash
# Script to install CUPS filter wrappers for Fujifilm Apeos printers with User Authentication
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

# Install pdftopjlff wrapper (handles PDF -> PJL with page count logging & job name)
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

# Count pages from PDF and report to CUPS via stderr for page_log
PAGES=$(pdfinfo "$INFILE" 2>/dev/null | awk '/Pages:/ {print $2}')
COPIES="${4:-1}"
if ! [[ "$COPIES" =~ ^[0-9]+$ ]] || [ "$COPIES" -lt 1 ]; then
    COPIES=1
fi

if [ -n "$PAGES" ] && [ "$PAGES" -gt 0 ]; then
    for ((p=1; p<=PAGES; p++)); do
        >&2 echo "PAGE: $p $COPIES"
    done
    >&2 echo "PAGE: total $((PAGES * COPIES))"
fi

# Clean job title for PJL
JOB_TITLE="${3:-Print Job}"
CLEAN_TITLE=$(echo "$JOB_TITLE" | tr -d '"\r\n\\')

# Run original filter and inject PJL authentication & job name headers
"$ORIG_BIN" "$1" "$2" "$3" "$4" "$5" "$INFILE" | awk -v u="printerserver" -v p="cskmitl" -v t="$CLEAN_TITLE" '{
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

JOB_TITLE="${3:-Print Job}"
CLEAN_TITLE=$(echo "$JOB_TITLE" | tr -d '"\r\n\\')

"$ORIG_BIN" "$1" "$2" "$3" "$4" "$5" "$INFILE" | awk -v u="printerserver" -v p="cskmitl" -v t="$CLEAN_TITLE" '{
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

echo "CUPS Fujifilm authentication filter setup completed successfully."
