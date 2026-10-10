import argparse

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="world")
    args = parser.parse_args(argv)
    return f"Hello, {args.name}!"

if __name__ == "__main__":
    print(main())
