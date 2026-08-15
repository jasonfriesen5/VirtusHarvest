#!/bin/bash
cd "$(dirname "$0")"
JLinkExe -CommanderScript flash_feather.jlink
