P1

UhfReaderSdk Interface
Reader Connection


Connect to the Reader

Method	synchronized Integer connectReader()
Parameter	
Return value	Connection success or failure
Note	

Close the Reader
Method	synchronized void closeReader()
Parameter	
Return value	Connection success or failure
Note	Generally, this interface shall not be called, because other apps may be also using the reader


Whether the Reader has been Opened

Method	Boolean isReaderOpen()
Parameter	
Return value	Opened or not
Note	Whether the reader module has been opened


Get the Working State of Reader

Method	Integer getReaderWorkState()
Parameter	
Return value	Reader working state
Note	


Working state of reader






P2
enum class ReaderWorkState(val state: Int) {
READER_CLOSE(0),//Close
READER_OPEN(1),//Open
READER_SEARCH(2),//Search card
READER_READ(3),//Read data
READER_WRITE(4),//Read data
READER_LOCKTAG(5),//Lock card
READER_DESTROYTAG(6),//Destroy card
}
Search Card
Register Card Search Listener
Method	void registerReadListener(@Nullable IReadListener readListener)
Parameter	Listener
Return value	
Note	Ensure that the AIDL service has been connected during registration
Listener
private static final IReadListener.Stub readListener = new IReadListener.Stub()
{
@Override
public void tagRead(List<TagInfo> tags) {
}
@Override
public void tagReadException(int errorCode) {
}
//AIDL service differentiation listener when used for registering the listener
@Override
public String getTag() throws RemoteException {
return "" + this.hashCode();
}
};
TagInfo
// Which antenna reads the tag
private final byte AntennaID;
// From which frequency point is the tag read
private final int Frequency;
// Timestamp read by the tag, in milliseconds (relative to the moment the command is issued)
private final int TimeStamp;
// Addition al data length
private final short EmbeddedDataLen;
// Additional data
@Nullable
private final byte[] EmbeddedData;

P3

// epc length, in byte
private final short EpcLen;
// pc code, hexadecimal byte array
@NotNull
private final byte[] PC;
// pc code, hexadecimal byte array

@Nullable
private final byte[] EpcId;
// Tag protocol
@Nullable
private final String protocol;
// Signal strength
private final int RSSI;


Register the listener again during AIDL connection

// Register the observer, and connect the reader and register the card search listener again after AIDL service connection
com.seuic.androidreader.sdk.Constants.INSTANCE.getConnectState().observeForever(
aidlInfoBean -> {
if (aidlInfoBean.getState() ==
com.seuic.androidreader.sdk.Constants.CONNECTED) {
WorkStateUtils.getINSTANCE().tryConnect();
TagListener.getINSTANCE().registerReadListener();
Log.e(TAG, "register the card search listener");
}
});


AIDL Service connection state

const val DISCONNECT = 0 //Disconnected
const val CONNECTED = 1 //Connected
const val CONNECTING = 2 //Connecting



Cancel Card Search Listener

Method	void unregisterReadListener(@Nullable IReadListener readListener)

Parameter	Listener
Return value	
Note	

Clear Card Search Listener

Method	void clearReadListeners()
Parameter	
Return value	
Note	
















P4
Single Card Search
Method	synchronized Integer inventoryOnce(@NotNull int[] ants, int timeout)
Parameter	ants: array of enabled antennas, timeout: timeout period (millisecond)
Return value	0 success, non-0 failure
Note	The card search data is acquired through the listener

Continuous Card Search

Method	synchronized Integer inventoryStart(@NotNull int[] ants)
Parameter	ants: array of enabled antennas
Return value	0 success, non-0 failure
Note	The card search data is acquired through the listener

Stop Card Search


Method	synchronized Integer inventoryStop()
Parameter	
Return value	0 success, non-0 failure
Note	


Tag Operation
Read the Tag


Method	synchronized ParamsBackData<byte[]> readTagData(int antenna, int bank, int
blockCount, int startAddress, @NotNull String accessPassword, @NotNull String
epc)
Parameter	antenna: Antenna ports 1~8
bank: area (0, reserved area; 1, EPC area; 2, TID area; 3, user data area)
blockCount: number of blocks (one character per block, and the characteris the unit)
startAddress: Start address (in character)
accessPassword: Access password
epc: Tag EPC value to be filtered
Return value	Hexadecimal byte array
Note	




P5

Write the Tag


Method	synchronized Integer writeTagData(int antenna, int bank, @NotNull String data,
int startAddress, @NotNull String accessPassword, @NotNull String epc)

Parameter	antenna: Antenna ports 1~8
bank: area (0, reserved area; 1, EPC area; 2, TID area; 3, user data area)
data: Hexadecimal character string
startAddress: Start address (in character)
accessPassword: Access password
epc: Tag EPC value to be filtered
Return value	0 success, non-0 failure
Note	



Lock the Tag

Method	synchronized ParamsBackData<Integer> lockTag(int antenna, int lockBank, int
lockType, @NotNull String accessPassword, @NotNull String epc)

Parameter	antenna: Antenna ports 1~8
lockBank: area (0, reserved area; 1, EPC area; 2, TID area; 3, user data area)
lockType: Lock operation type (0, unlock; 1, lock; 2, permanent lock)
accessPassword: Access password
epc: Tag EPC value to be filtered
Return value	0 success, non-0 failure
Note	The first two characters in the reserved area are the destruction password, and the last two characters are the access password; the access password must be changed before locking the card (it cannot be 00000000); when the reserved area is locked, the modified password needs to be used for both reading and writing; when locking other three areas, you may use 00000000 to read. However, if you need to write (the TID area is not writable), you must use the modified password


Destroy the Tag

Method	synchronized Integer killTag(int antenna, @NotNull String killPassword,
@NotNull String epc)

Parameter	antenna: Antenna ports 1~8
killPassword: Destruction password
epc: Tag EPC value to be filtered
Return value	0 success, non-0 failure
Note	



P6
Reader Parameters

Get the Power


Method	ParamsBackData<AntPowerData[]> getPower()
Parameter	
Return value	Antenna array, power 1~33
Note	

AntPowerData


// Antenna id 1~8
var antid: Int = 0,
var readPower: Short = 0,
var writePower: Short = 0

Set the Power

Method	Integer setPower(@NotNull AntPowerData[] antPowers)

Parameter	Antenna array, power 1~33
Return value	0 success, non-0 failure
Note	



Get the Frequency Band
Method	ParamsBackData<String> getRegion()

Parameter	Frequency band character string (FCC, ETSI, China1, China2)
Return value	Frequency band
Note	FCC: North America, ETSI: Europe, China1: China1, China2: China2, KR: Korea


Set the Frequency Band
Method	Integer setRegion(String region)

Parameter	Frequency band character string
Return value	0 success, non-0 failure
Note	












P7 

Get the Embedded Data

Method	ParamsBackData<EmbeddedBean> getEmbeddedData()
Parameter	
Return value	Embedded data
Note	

Embedded Bean

// Reserved area 0, TID area 2, USER area 3
private int bank;
// start address (in bytes)
private int startaddr;
// number of bytes
private int bytecnt;
// access password
@NotNull
private byte[] accesspwd;
// Whether to enable
private boolean enable;

Set the Embedded Data

Method	Integer setEmbeddedData(int startAddress, int byteCount, int bank, String
accessPassword, boolean enable)
Parameter	startAddress: Start address (in bytes)
byteCount: Number of bytes
bank: reserved area 0, TID area 2, USER area 3
access Password: Access password
enable: Whether to enable additional data
Return value	0 success, non-0 failure
Note	EPC area cannot be set

Get the Filter

Method	ParamsBackData<FilterBean> getFilter()
Parameter	
Return value	Filter parameters
Note	

P8

FilterBean

// Filter data areas 1, 2, 3, which are EPC, TID and User, respectively
private Integer bank;
// Filter data start address (bytes)
private Integer startAddress;
// Filter data
@NotNull
private String data;
//Match or not
private Boolean isInvert;
// Whether to enable filtering
private Boolean enable;


Set the Filter

Method	Integer setFilter(int startAddress, int bank, String data, boolean isInvert,
boolean enable)
Parameter	startAddress: start address (in bytes)
bank: Filter data areas 1, 2, 3, which are EPC, TID and User, respectively
data: Filtered data
isInvert: Match or not
enable: Whether to enable filtering
Return value	0 success, non-0 failure
Note	After enable is set to true, it will always take effect, unless enable is set to false to clear the filter

Get the Session

Method	ParamsBackData<Integer> getSession()
Parameter	
Return value	session
Note	


Set the Session
Method	Integer setSession(@IntRange(from = 0L,to = 3L) int session)

Parameter	session 0~3

Return value	0 success, non-0 failure
Note	



P9

Get the Profile
Method	ParamsBackData<Integer> getProfile()

Parameter	
Return value	profile
Note	


Set the Profile

Method	Integer setProfile(@IntRange(from = 1L,to = 4L)int profile)

Parameter	profile 1~4

Return value	0 success, non-0 failure
Note	


Get the Target
Method	ParamsBackData<Integer> getTarget()
Parameter	
Return value	target
Note	


Set the Target

Method	Integer setTarget(@IntRange(from = 0L,to = 3L) int flag)

Parameter	target 0~3

Return value	0 success, non-0 failure
Note	


Get the qValue
Method	ParamsBackData<Integer> getQValue()
Parameter	
Return value	qValue

Note	





P10

Set the qValue
	
Method	Integer setQValue(@IntRange(from = -1L,to = 15L) int qValue)

Parameter	q -1~15

Return value	0 success, non-0 failure
Note	q=-1 indicates automatic mode


Get the Identified Antenna

Method	ParamsBackData<InvantAntData> getInvantAnt()
Parameter	
Return value	Identified antenna
Note	

InvantAntData

// Total number of identified antennas
private int antcnt;
// Array of identified antennas
@NotNull
private int[] connectedants;

Get the Temperature

Method	ParamsBackData<Integer> getTemperature()
Parameter	
Return value	Temperature (Celsius)
Note	


Get the Reader Version

Method	ParamsBackData<VersionData> getVersion()

Parameter	
Return value	Reader version
Note	


Version Data


P11

// Firmware information
@NotNull
private String firmdata;
// boot version
@NotNull
private String bootver;
// hardware version
@NotNull
private String hardver;
// Firmware version
@NotNull
private String firmver;

GPIO
Get the gpi
Method	ParamsBackData<Integer> getGpi(int gpi)
Parameter	gpi: Port number 1~4
Return value	0 low level
Note	


Set the gpo
Method	Integer setGpo(int gpo, int value)

Parameter	gpo: Ports 1~4
value: High and low level
Return value	0 success, non-0 failure
Note	

LED Light

The Green Light Starts Flickering during Card Search

Method	void startBling()
Parameter	
Return value	
Note	The green light will flicker when such interface is called during the continuous card search





P12
The Green Light Stops Flickering during Card Search
Method	void startBling()
Parameter	
Return value	
Note	The green light will be normally on when such interface is called during the continuous card search


Set to Switch on or off the LED Light


Method	void setLed(@IntRange(from = 0L,to = 3L) int port, boolean enable)
Parameter	Port: 0 red light, 1 green light, 2 blue light, 3 pink light
enable:true On
Return value	
Note	Generally such interface is not called



Buzzer
Set the Buzzer Enabling
Method	void setBZEnable(boolean enable)

Parameter	Whether to enable the buzzer
Return value	
Note	It does not mean to make the buzzer sound, but means whether the buzzer can sound after the interface that sounds is called


Get the Buzzer Enabling
Method	Boolean getBZEnable()

Parameter	
Return value	Whether the buzzer is available
Note	The interface of the buzzer that sounds can be still called when it is not available. However, it will not sound actually

Buzzer Sounding

Method	void startBZ()

Parameter	
Return value	
Note	The buzzer sounds for a long time, and it will stop automatically after more than 15 seconds

P13

Buzzer Stop

Method	void stopBZ()

Parameter	
Return value	
Note	Stop the buzzer from sounding


Buzzer Starts Sounding during Card Search

Method	void startBZForSearching()
Parameter	
Return value	
Note	When such interface is called during continuous card search, it will sound once a second

Buzzer Stops Sounding during Card Search

Method	void stopBZForSearching()

Parameter	
Return value	
Note	When such interface is called after the stop of continuous card search, the buzzer will stop sounding


Encapsulation Type

ParamsBackData

// Whether the operation is successful or not; 0 means success, and then fetch data after success
private int err;
// Acquired result
@Nullable
private Object data;
// Type of data
@Nullable
private Class classType;



