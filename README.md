# hyperbee2-bench

Benchmark suite for hyperbee2

To run the benchmarks:

```
./run.js PATH_TO_HYPERBEE2_CHECKOUT
```

This will write the results to a JSON file in `www/results`.

Results can be viewed and compared between recent runs by serving up the
`www` directory:

```
python3 -m http.server -d www -b 127.0.0.1
```
