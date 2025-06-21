# Workspaces

A workspace is a mountable, versioned file system that can be used for development.

There are two kinds of files in a workspace:

1. Source files
    - Files that are considered the source. These files are typically what would be checked into a source repository.
3. Produced files
    - Files that are produced from the source and production files. These are usually built via a build system such as
      make, bazel, gradle, etc.

## Layers
A workspace is a layered file system with a different layer for each kind of file. Each layer is controlled by
a slot. As files are written to the layer, the slot is updated to store the current root of the layer. Each layer is
overlaid together to form a single logical directory. Which file is in which layer is controlled by the layer
configuration file which is typically built using a `.gitignore` file, or similar wildcard description. Once created,
The underlying layered file server will put each file in the layer described by the layer configuration created when the
workspace is created.

### Source files (input)
The workspace source slot is different than the repository branch slot (or the "branch"). The branch is the current
"checked in" version of the file. The workspace slot is the current local changes that are being prepared to become a
commit in the branch. Once the files are committed, the branch will be updated. If the branch is changed by some other
workspace, the workspace can be merge or rebased to the changes in the branch.

### Produced files (output)
The files produced, or built, from the source files are controlled by a separate slot than the workspace files. The slot
is typically backed by a storage service that caches the files locally. The produced files may be used by a build
system as a cache of build rule results to allow the build system to incrementally build the files. In
this case the files may be stored remotely or stored locally first then eventually made available remotely.

## Creating a workspace
A workspace is created by the `invariant workspace` command which takes an  By default, `main` is used as the name of the
branch in the repository and, by default, the name of the repository is used as the directory name.

A workspace is created by creating a workspace configuration which contains the layer configuration and the value of
the current working branch branch information which includes slots for the source files and output files for the branch.
The initial slot value is the sources branch. The output slot is an empty directory. The configuration stores the slot
address in a content link that also stores any compression and encryption that is required for the root directory.

Once the configuration is created, a files server is started and mounted to the requested directory.

## Branches
A workspace is tied to a single upstream branch. To switch branches, create a new workspace for that branch in a sibling
directory. You can have multiple workspaces for the same branch in sibling directories and change (or create) a new
upstream branch to branch development.

### Feature branch
Feature branches are not necessary as to start development of a new feature only requires creating a new workspace directory
from the branch that is the target of the feature. Features branches can be created but the workspace slot acts as the
feature branch for most purposes.

