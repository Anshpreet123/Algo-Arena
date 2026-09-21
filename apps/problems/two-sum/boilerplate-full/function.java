
import java.io.*;
import java.util.*;

public class Main {
    
    ##USER_CODE_HERE##

    public static void main(String[] args) {
        // The judge pipes the testcase in on stdin.
        List<String> lines = readLinesFromStdin();
        int num1 = Integer.parseInt(lines.get(0).trim());
  int num2 = Integer.parseInt(lines.get(1).trim());
        int result = sum(num1, num2);
        System.out.println(result);
    }

    public static List<String> readLinesFromStdin() {
        List<String> lines = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(System.in))) {
            String line;
            while ((line = br.readLine()) != null) {
                lines.add(line);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
        return lines;
    }
}