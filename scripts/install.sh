#!/bin/bash

echo 'Set the following ENV variables before running this script:'
echo 'NODE_VERSION - version of node you wish to use. default:0.10.29'
echo 'PG_VERSION - version of postgresql you wish to use. default:9.3'
echo 'XCORE_DATABASE - the name of the database you want installed. default:dev'
echo 'XCORE_VERSION - the version of xCore you wish to run. default:0.0.1'
echo 'XCORE_SEED - create an empty database or load with demo data.(empty|demo) default:empty'
alias sudo='sudo env PATH=$PATH $@' # $@ sees arguments as separate words.

APP_NAME='xCore'
XCORE_VERSION=${XCORE_VERSION:-'0.0.1'}
NODE_VERSION=${NODE_VERSION:-'0.10.28'}
DATABASE=${XCORE_DATABASE:-'dev'}
PG_VERSION=${PG_VERSION:-'postgresql-9.3'}
PG_VERSION_NUM=(${PG_VERSION//-/ }) # Split postgres-9.3 on '-' into array
PGDIR=/etc/postgresql/${PG_VERSION_NUM[1]}/main # Use idx 1 of pg version arr.
XCORE_SEED=${XCORE_SEED:-'empty'}
RUN_DIR=$(pwd)
LOG_FILE=$RUN_DIR/install.log
RUNALL=true
LIBS_ONLY=
XCORE_DIR=$RUN_DIR

cp $LOG_FILE $LOG_FILE.old 2>&1 &> /dev/null

log() {
  echo "$APP_NAME >> $@"
  echo $@ >> $LOG_FILE
}

varlog() {
  log $(eval "echo $1 = \$$1")
}

cdir() {
  cd $1
  log "Changing directory to $1"
}

while getopts ":ipnhmcdt-:" opt; do
  case $opt in
    i)
      # Install packages
      RUNALL=
      INSTALL=true
      ;;
    p)
      # Configure postgres
      RUNALL=
      POSTGRES=true
      ;;
    n)
      # iNitialize the databases and stuff
      RUNALL=
      INIT=true
      ;;
    m)
      RUNALL=
      NPM_INSTALL=true
      ;;
    t)
      # only for initializing a fresh debian package install
      RUNALL=
      USERINIT=true
      ;;
    h)
      echo "Usage: install [OPTION]"
      echo "Build the full xCore Development Environment."
      echo ""
      echo "To install everything, run sudo ./scripts/install.sh"
      echo "Everything will go in /usr/local/src/xcore"
      echo ""
      echo "  -h Print this (h)elp documentation.\t\t"
      echo "  -i (i)nstall packages.\t\t"
      echo "  -p Configure (p)ostgres\t\t"
      echo "  -n I(n)itialize the databases.\t\t"
      echo "  -m Install Node Package (m)anager.\t\t"
      echo "  -t Ini(t)ialize a fresh Debian install."
      exit 0;
      ;;
  esac
done

if [ $RUNALL ]
then
  INSTALL=true
  POSTGRES=true
  INIT=true
fi

if [ $USERINIT ]
then
  INSTALL=
  POSTGRES=
  INIT=
fi

if [ -z "$NODE_VERSION" ]
then
  log "WARNING: A node version has not been set."
  return 1
fi

# Print what xCore will be built using
varlog NODE_VERSION
varlog XCORE_VERSION

install_npm() {
  log "installing nvm and latest node"
  sudo apt-get -q -y install node
  sudo apt-get -q -y install curl
  sudo bash $XCORE_DIR/scripts/npm_install.sh
  wait
  sudo npm cache clean -f
  sudo npm update -g
  source ~/.bashrc
  sudo npm install -g n
  sudo n $NODE_VERSION

  # if [ ! -d "/usr/local/node-install" ]; then
  #   sudo rm -f /usr/local/bin/nodejs
  #   sudo rm -f /usr/local/bin/node
  #   sudo mkdir /usr/local/node-install
  #   cdir /usr/local/node-install
  #   git clone git://github.com/joyent/node.git
  #   cd node
  #   ./configure --prefix=/usr/local/bin
  #   make install
  #   cd ..
  #
  #   git clone git://github.com/isaacs/npm.git
  #   cd npm
  #   make install # or `make link` for bleeding edge
  #   wait
  #
  #   sudo npm cache clean -f
  #   sudo npm install -g n
  #   sudo n $NODE_VERSION
  # fi
}

install_packages() {
  log "installing postgres"
  sudo bash $XCORE_DIR/scripts/apt.postgresql.org.sh
  echo "Running apt-get upgrade ..."
  sudo apt-get -y upgrade
  echo "Installing Postgres ..."
  sudo apt-get -q -y install $PG_VERSION
  sudo apt-get -q -y install postgresql-${PG_VERSION_NUM[1]}-plv8

  install_npm
}

# Use only if running from a debian package install for the first time
user_init() {
  if [ "$USER" = "root" ]
  then
    echo "Run this as a normal user"
    return 1
  fi
  echo "WARNING: This will wipe clean the xcore folder in your home directory."
  echo "Hit ctrl-c to cancel."
  read PAUSE
  read -p "Github username: " USERNAME ERRS
  rm -rf ~/xcore

  git clone git://github.com/$USERNAME/xcore.git
  git remote add xcore git://github.com/pangea/xcore.git
}

# Configure postgres and initialize postgres databases
setup_postgres() {
  log "copying configs..."

  # First we backup the original Postgres config. Next we'll have postgres
  # listen on all IP's instead of just localhost. Install plv8
  # custom_variable_class for the plv8 postgres module. Then finally overwrite
  # the original config file and change ownwership to the postgres user.
  sudo cp $PGDIR/postgresql.conf $PGDIR/postgresql.conf.default # Backup the config file
  sudo cat $PGDIR/postgresql.conf.default | sed "s/#listen_addresses = \S*/listen_addresses = \'*\'/" | sed "s/#custom_variable_classes = ''/custom_variable_classes = 'plv8'/" | sudo tee $PGDIR/postgresql.conf > /dev/null
  sudo chown postgres $PGDIR/postgresql.conf

  # First we backup the original pg_hba config file. Next we will enable
  # logging into postgres from outside the host machine.
  sudo cp $PGDIR/pg_hba.conf $PGDIR/pg_hba.conf.default
  sudo cat $PGDIR/pg_hba.conf.default | sed "s/local\s*all\s*postgres.*/local\tall\tpostgres\ttrust/" | sed "s/local\s*all\s*all.*/local\tall\tall\ttrust/" | sed "s#host\s*all\s*all\s*127\.0\.0\.1.*#host\tall\tall\t127.0.0.1/32\ttrust#" | sudo tee $PGDIR/pg_hba.conf > /dev/null
  sudo chown postgres $PGDIR/pg_hba.conf

  log "restarting postgres..."
  sudo service postgresql restart

  log "dropping existing db, if any..."
  sudo -u postgres dropdb $DATABASE

  cdir $XCORE_DIR/scripts/sql

  if [ ! -f xcore-${XCORE_SEED}.backup ]
  then
    log "ERROR - xcore/scripts/sql/xcore-${XCORE_SEED}.backup is missing."
    log "Pull the script then run run 'bash scripts/install.sh -pn' to finish installing this package."
    return 3
  fi

  if [ ! -f init.sql ]
  then
    log "ERROR - xcore/scripts/sql/init.sql is missing."
    log "Pull the script then run run 'bash scripts/install.sh -pn' to finish installing this package."
    return 3
  fi

  log "Setup database"
  sudo -u postgres psql -q -f 'init.sql' 2>&1 | tee -a $LOG_FILE
  sudo -u postgres createdb -O admin $DATABASE 2>&1 | tee -a $LOG_FILE
  sudo -u postgres pg_restore -d $DATABASE xcore-${XCORE_SEED}.backup 2>&1 | tee -a $LOG_FILE
  sudo -u postgres psql $DATABASE -c "CREATE EXTENSION plv8" 2>&1 | tee -a $LOG_FILE
  cp xcore-demo.backup $XCORE_DIR/test/lib/demo-test.backup
}
#
# init_everythings() {
#   log "Setting properties of admin user"
#
#   cdir $XT_DIR/node-datasource
#
#   cat sample_config.js | sed "s/testDatabase: \"\"/testDatabase: '$DATABASE'/" > config.js
#   log "Configured node-datasource"
#   log "The database is now set up..."
#
#   mkdir -p $XT_DIR/node-datasource/lib/private
#   cdir $XT_DIR/node-datasource/lib/private
#   cat /dev/urandom | tr -dc '0-9a-zA-Z!@#$%^&*_+-'| head -c 64 > salt.txt
#   log "Created salt"
#   openssl genrsa -des3 -out server.key -passout pass:xtuple 1024 2>&1 | tee -a $LOG_FILE
#   openssl rsa -in server.key -passin pass:xtuple -out key.pem -passout pass:xtuple 2>&1 | tee -a $LOG_FILE
#   openssl req -batch -new -key key.pem -out server.csr -subj '/CN='$(hostname) 2>&1 | tee -a $LOG_FILE
#   openssl x509 -req -days 365 -in server.csr -signkey key.pem -out server.crt 2>&1 | tee -a $LOG_FILE
#   if [ $? -ne 0 ]
#   then
#     log "Failed to generate server certificate in $XT_DIR/node-datasource/lib/private"
#     return 3
#   fi
#
#   cdir $XT_DIR/test/lib
#   cat sample_login_data.js | sed "s/org: \'dev\'/org: \'$DATABASE\'/" > login_data.js
#   log "Created testing login_data.js"
#
#   cdir $XT_DIR
#   node scripts/build_app.js -d $DATABASE 2>&1 | tee -a $LOG_FILE
#   sudo -u postgres psql -w $DATABASE -c "select xt.js_init(); insert into xt.usrext (usrext_usr_username, usrext_ext_id) select 'admin', ext_id from xt.ext where ext_location = '/core-extensions';" 2>&1 | tee -a $LOG_FILE
#
#   log "You can login to the database and mobile client with:"
#   log "  username: admin"
#   log "  password: admin"
#   log "Installation now finished."
#   log "Run the following commands to start the datasource:"
#   if [ $USERNAME ]
#   then
#     log "cd node-datasource"
#     log "node main.js"
#   else
#     log "cd /usr/local/src/xtuple/node-datasource/"
#     log "node main.js"
#   fi
# }
#
if [ $USERINIT ]
then
  user_init
fi

if [ $INSTALL ]
then
  log "install_packages()"
  install_packages
  if [ $? -ne 0 ]
  then
    log "package installation failed."
    exit 1
  fi
fi

if [ $POSTGRES ]
then
  log "setup_postgres()"
  #setup_postgres
  if [ $? -ne 0 ]
  then
    exit 4
  fi
fi

if [ $NPM_INSTALL ]
then
  log "install_npm()"
  install_npm
  if [ $? -ne 0 ]
  then
    exit 4
  fi
fi
# if [ $INIT ]
# then
#   log "init_everythings()"
#   init_everythings
#   if [ $? -ne 0 ]
#   then
#     log "init_everythings failed"
#   fi
# fi
#
log "All Done!"
