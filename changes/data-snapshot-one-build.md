- The catalog snapshot is built by one Worker at a time, not by every Worker
  that heard of the same change: on live as many as nine built each new
  snapshot together, and each took 20-43 s instead of about 6 s. The build's
  log line now also says how many statements it sent and its slowest one.
