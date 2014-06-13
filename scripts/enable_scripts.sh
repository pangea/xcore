#!/bin/bash

# Add scripts path to user's execute path
SCRIPT=$(readlink -f $0) # Absolute path to this script.
SCRIPTPATH=`dirname $SCRIPT` # Absolute path this script is in.

echo "PATH=$PATH:${SCRIPTPATH}" >> ~/.bashrc
echo "export PATH" >> ~/.bashrc

# Add execute privileges to scripts
for i in "$SCRIPTPATH/"*; do
  extension="${i##*.}"

  if [ "$extension" = "js" ] || [ "$extension" = "sh" ]; then
    chmod +x "$i"
  fi
done

log "All done! Now run \"source ~/.bashrc\" to get access to scripts."
