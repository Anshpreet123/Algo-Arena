#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <climits>

##USER_CODE_HERE##

int main() {
  // The judge pipes the testcase in on stdin. It used to be read from a file
  // inside the Judge0 container, which is why this harness once needed the
  // problems directory bind-mounted into the sandbox.
  std::vector<std::string> lines;
  std::string line;
  while (std::getline(std::cin, line)) lines.push_back(line);

  int num1;
  std::istringstream(lines[0]) >> num1;
  int num2;
  std::istringstream(lines[1]) >> num2;
  int result = sum(num1, num2);
  std::cout << result << std::endl;
  return 0;
}
