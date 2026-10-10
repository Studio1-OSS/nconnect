import argparse

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="world")
    parser.add_argument("--upper", action="store_true")
    args = parser.parse_args(argv)
    text = f"Hello, {args.name}!"
    return text.upper() if args.upper else text

if __name__ == "__main__":
    print(main())
