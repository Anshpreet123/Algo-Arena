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

  int size_arr;
  std::istringstream(lines[0]) >> size_arr;
  std::vector<int> arr(size_arr);
  if (size_arr != 0) {
  	std::istringstream iss_arr(lines[1]);
  	for (int i = 0; i < size_arr; i++) iss_arr >> arr[i];
  }
  int result = maxElement(arr);
  std::cout << result << std::endl;
  return 0;
}
