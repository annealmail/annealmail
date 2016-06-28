#!/bin/sh

# Wrapper script for launching ccr-agent

CCR_AGENT=$1
TMPFILE=$2
shift 2

$CCR_AGENT "$@" > $TMPFILE 2>&1

exit 0
