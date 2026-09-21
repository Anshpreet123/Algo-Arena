use std::io::{self, Read};
use std::str::Lines;

##USER_CODE_HERE##

fn main() -> io::Result<()> {
  // The judge pipes the testcase in on stdin.
  let mut input = String::new();
  io::stdin().read_to_string(&mut input)?;
  let mut lines = input.lines();
  let num1: i32 = lines.next().unwrap().parse().unwrap();
  let num2: i32 = lines.next().unwrap().parse().unwrap();
  let result = sum(num1, num2);
  println!("{}", result);
  Ok(())
}
