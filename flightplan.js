var plan = require('flightplan');

var appName = 'timeoff';
var username = 'deploy';

var tmpDir = appName + '-' + new Date().getTime();

// configuration
plan.target('production', [
    {
        host: '188.166.169.13',
        username: 'deploy',
        privateKey: '/Users/miguel/.ssh/id_rsa',
        agent: process.env.SSH_AUTH_SOCK,
        installDir: '~/' + appName + '/'
    }
]);

// run commands on localhost
plan.local(function (local) {

    local.log('Copy files to remote hosts');
    var filesToCopy = local.exec('git ls-files', {silent: true});
    // rsync files to all the destination's hosts
    local.transfer(filesToCopy, '/tmp/' + tmpDir);
});

// run commands on remote hosts (destinations)
plan.remote(function (remote) {

    var installDir = plan.runtime.hosts[0].installDir;

    //Create directory if doesn't already exist (-p)
    remote.exec('mkdir -p ' + installDir);
    remote.sudo('ln -snf ' + installDir + tmpDir + ' ' + installDir + appName, {user: username});

    //Move data from tmp directory to destination folder
    remote.log('Move folder to home directory');
    remote.sudo('cp -R /tmp/' + tmpDir + ' ' + installDir + tmpDir, {user: username});
    remote.rm('-rf /tmp/' + tmpDir);

    //Change directory to project and install dependencies
    remote.log('Install dependencies');
    remote.with('cd ' + installDir + tmpDir, {silent: true}, function () {
        remote.exec('npm install --production', {user: username});
    });

    //Stop application execution -> Update symlink to new directory -> Start application
    remote.with('cd ' + installDir + appName, {silent: true}, function () {
        remote.exec('forever stopall ', {failsafe: true});

        remote.log('Reload application');
        remote.sudo('ln -snf ' + installDir + tmpDir + ' ' + installDir + appName, {user: username});

        if (plan.runtime.target === 'production')
            remote.exec('NODE_ENV=production PORT=3000 forever start -c "npm start" .');
        else
            remote.exec('NODE_ENV=development PORT=3000 forever start -c "npm start" .');
    });

});
