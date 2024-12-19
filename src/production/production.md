# Invariant production

A production server maintains the results of tasks where a task is some transformation of input to output. The task, input and output are identified by their content address which is used to form a content link that can be mounted in a file server.

For example, a simple task would be transform a markdown file, like is the source for this document, into a corresponding HTML file. The task, for example, could be a link to a mark-down conversion, the input is the markdown source and the resulting output would be the HTML. Once an HTML file is produced for a markdown file, the production server can be notified that the output of the markdown transform task for the input is has the content address of the output. This allows a system to query the production server for the output, and only produce it again if the production server doesn't know the result.

The production server is not responsible for producing or storing the output. It is only responsible for maintaining the association between the input and the output given a particular task.

# Types

## `:task`

The `:task` is a content address of the task. The is the `address` part of a content-link which needs to be agreed upon by the system that executes the task and is not maintained by the production server.

## `:address`

An `:address` is the address part of a content link. Similar to a `:task`, the rest of the content link is not maintained by the production server and has to be agreed upon ahead of time.

# PUT `/production/:task/:address?output=:address

Record the output of a task given the specified input.

# GET `/production/:task/:address

Obtain the result of a task given the specified output. A 404 result indicates that the result of the task is unknown to the production server.

