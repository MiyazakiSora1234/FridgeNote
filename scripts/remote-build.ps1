# Windows -> Mac build machine. The Mac pulls the source from GitHub (push first!) and runs xcodebuild.
#
#   .\scripts\remote-build.ps1            # build for the simulator
#   .\scripts\remote-build.ps1 -Mode test # run unit tests
#
# Uses the Windows OpenSSH client (it can talk to the Windows ssh-agent; Git Bash's ssh cannot).
# The host alias "build-mac" must exist in ~/.ssh/config.
param(
    [ValidateSet("build", "test")]
    [string]$Mode = "build",
    [string]$RemoteDir = "~/work/FridgeNote",
    [string]$Repo = "https://github.com/MiyazakiSora1234/FridgeNote.git"
)

$ErrorActionPreference = "Stop"
$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"

$remote = "if [ -d $RemoteDir/.git ]; then :; else mkdir -p `$(dirname $RemoteDir) && git clone $Repo $RemoteDir; fi; $RemoteDir/scripts/mac-build.sh $Mode"
& $ssh build-mac "bash -lc '$remote'"
exit $LASTEXITCODE
