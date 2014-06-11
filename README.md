xCore Readme
=================
Before we begin
---------------
You'll notice in the ./scripts directory an installation script called
install.sh. This script is not meant to be used for production installations of
**xCore**. It is used by Vagrant to install the enviornment on your development
virtual machine. It is also used by TravsCI to install the environment for test
purposes. For production deployments this application should be deployed using
Chef/Puppet or some other automated and **REPEATABLE** deployment setup.

Development
-----------
For instructions on setting up Vagrant Virtual Development Environment please
read the README.md file located in the xcore-vagrant repository.

Testing
-------
**xCore** is tested using [TravisCI](http://docs.travis-ci.com/user/build-configuration/)
and the [Mocha testing framework](http://visionmedia.github.io/mocha/)

Deployment
----------
Chef Recipes need to be built for xCore.
