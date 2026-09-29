#!/bin/bash
# Downloads the scanned Likkutei Sichos subject indexes (Otzros HaRebbe Drive)
# and the Chabad Library's typed copies into vols/. Nothing here is committed.
set -e
cd "$(dirname "$0")"
# Chabad Library subject-index root per volume (37 has none).
declare -A CL=( [30]=1301420002 [31]=1301460002 [32]=1301500002 [33]=1301440002 [34]=1301560002 [35]=1301690002 [36]=1301740002 [38]=1301830002 [39]=1301880002 )
# Otzros HaRebbe Drive file per volume index.
declare -A DR=( [30]=1qbx7dZxAjUQBc662yoiA8e01iCkqA7jf [31]=1v87nz_v-iufnxJoDpDv4dR2pvZHQ3HkR [32]=13EvGpJbm0YRcIR5MKxeiHFbdYDWeY0zs [33]=1P71GxPwOmVTKk46ozybfitOj41yMCYaX [34]=1vptQt9DlYwMw6OLdDGg5gLuSvahbUKuN [35]=1O95xm6yp9G1nOy8Of9YvRlu7c0YSjBNa [36]=1rDxz-oA_qcoutPpkl9tB5CSGsmZzyscx [38]=1pDxc9qS2JjgBgrkdMiwHX18EriNBVu_B [39]=11zh7k9IB19iDSw1-4XisQ5YNxeXQPdp_ )
mkdir -p vols
for v in "${!CL[@]}"; do
  [ -s vols/ls$v.pdf ] || curl -sSL -m 600 -A 'Mozilla/5.0' "https://drive.google.com/uc?export=download&id=${DR[$v]}" -o vols/ls$v.pdf
  [ -s vols/truth$v.json ] || python3 cl_truth.py ${CL[$v]} vols/truth$v.json
done
