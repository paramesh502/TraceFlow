/** Ready-to-run Java algorithm snippets, loadable from the editor toolbar. */

export interface Sample {
  label: string;
  code: string;
}

export const SAMPLES: Sample[] = [
  {
    label: "Two Sum (HashMap)",
    code: `import java.util.*;

public class TwoSum {
    static int[] twoSum(int[] nums, int target) {
        HashMap<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{ map.get(complement), i };
            }
            map.put(nums[i], i);
        }
        return new int[]{ -1, -1 };
    }

    public static void main(String[] args) {
        int[] nums = { 2, 7, 11, 15 };
        int[] ans = twoSum(nums, 9);
        System.out.println(ans[0] + ", " + ans[1]);
    }
}`,
  },
  {
    label: "Recursion (Fibonacci)",
    code: `public class Fib {
    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        int result = fib(5);
        System.out.println(result);
    }
}`,
  },
  {
    label: "Bubble Sort (array)",
    code: `public class BubbleSort {
    public static void main(String[] args) {
        int[] arr = { 5, 1, 4, 2, 8 };
        for (int i = 0; i < arr.length - 1; i++) {
            for (int j = 0; j < arr.length - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    int tmp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = tmp;
                }
            }
        }
        System.out.println(arr[0]);
    }
}`,
  },
  {
    label: "Linked List reverse",
    code: `public class Reverse {
    static Node reverse(Node head) {
        Node prev = null;
        Node cur = head;
        while (cur != null) {
            Node next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        return prev;
    }

    public static void main(String[] args) {
        Node head = new Node(1, new Node(2, new Node(3, null)));
        Node r = reverse(head);
        System.out.println(r.val);
    }
}

class Node {
    int val;
    Node next;
    Node(int v, Node n) { val = v; next = n; }
}`,
  },
  {
    label: "Binary Search Tree",
    code: `public class BST {
    static TreeNode insert(TreeNode root, int v) {
        if (root == null) return new TreeNode(v);
        if (v < root.val) root.left = insert(root.left, v);
        else root.right = insert(root.right, v);
        return root;
    }

    public static void main(String[] args) {
        TreeNode root = null;
        int[] vals = { 5, 3, 8, 1, 4 };
        for (int v : vals) {
            root = insert(root, v);
        }
        System.out.println(root.val);
    }
}

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int v) { val = v; }
}`,
  },
];

export const DEFAULT_CODE = SAMPLES[0].code;
